"use strict";

const async = require("async");
const utilities = require("extra-utilities");
const fs = require("fs-extra");
const Group = require("duke3d-group");
//const Art = require("duke3d-art");
const Art = require("../../../Node.js/Duke3D Art/index.js");
//const Palette = require("duke3d-palette");
const Palette = require("../../../Node.js/Duke3D Palette/index.js");

const UPGRADED_ART_DIRECTORY = "upgraded";
const NEW_TILES_DIRECTORY = "sprites";

const groupFilePaths = {
	regular: "E:\\Game Stuff\\Duke Nukem 3D\\Official Duke Nukem Files\\Duke Nukem 3D\\DN3DINST\\DUKE3D.GRP",
	atomic: "E:\\Game Stuff\\Duke Nukem 3D\\Official Duke Nukem Files\\Duke Nukem 3D Atomic Edition\\ATOMINST\\DUKE3D.GRP",
	mod: "E:\\Game Stuff\\Duke Nukem 3D\\Modifications\\Total Conversions\\Quest for Hussein\\Mod Manager Files\\Regular Version (Native)\\HUSSEIN.GRP"
};

async.waterfall(
	[
		function(callback) {
			console.log("Loading group files...");

			const groupFiles = Object.fromEntries(Object.entries(groupFilePaths).map(function([type, path], index, collection) {
				console.log(`Loading ${type} group file from '${path}'.`);

				return [
					type,
					Group.readFrom(path)
				];
			}));

			const artFileCollections = Object.fromEntries(Object.entries(groupFiles).map(function([type, groupFile], index, collection) {
				console.log(`Retrieving  ${type} art files from group file '${groupFile.filePath}'.`);

				return [
					type,
					groupFile.getFilesWithExtension("ART").map(function(artGroupFile) {
						const artFile = Art.deserialize(artGroupFile.data);
						artFile.filePath = artGroupFile.name;
						return artFile;
					})
				];
			}));

			return async.mapValuesSeries(
				groupFiles,
				function(groupFile, type, callback) {
					console.log(`Retrieving ${type} palette files from group file '${groupFile.filePath}'.`);

					return async.mapSeries(
						groupFile.getFilesWithExtension("DAT").filter(function(paletteGroupFile) {
							return paletteGroupFile.name === "PALETTE.DAT" ||
								   paletteGroupFile.name === "LOOKUP.DAT";
						}),
						function(paletteGroupFile, callback) {
							return Palette.deserialize(
								paletteGroupFile.data,
								paletteGroupFile.name,
								function(error, paletteFile) {
									if(error) {
										return callback(error);
									}

									paletteFile.filePath = paletteGroupFile.name;

									return callback(null, paletteFile);
								}
							);
						},
						function(error, paletteFiles) {
							if(error) {
								return callback(error);
							}

							return callback(null, Object.fromEntries(paletteFiles.map(function(paletteFile) {
								return [paletteFile.fileType.equals(Palette.DAT.DATFileType.Palette) ? "palette" : "lookup", paletteFile];
							})));
						}
					);
				},
				function(error, paletteFiles) {
					if(error) {
						return callback(error);
					}

					console.log("Group files loaded!");

					return callback(null, groupFiles, artFileCollections, paletteFiles);
				}
			);
		},
		function(groupFiles, artFileCollections, paletteFiles, callback) {
			console.log("Comparing to original regular art files...");

			const upgradedArtFiles = [];
			const newTiles = [];

			for(let i = 0; i < artFileCollections.mod.length; i++) {
				let foundRegularArtFile = false;
				const modArtFile = artFileCollections.mod[i];

				for(let j = 0; j < artFileCollections.regular.length; j++) {
					const regularArtFile = artFileCollections.regular[i];

					if(modArtFile.localTileStart === regularArtFile.localTileStart) {
						foundRegularArtFile = true;
						let foundAtomicArtFile = false;

						for(let k = 0; k < artFileCollections.atomic.length; k++) {
							const atomicArtFile = artFileCollections.atomic[k];

							if(modArtFile.localTileStart === atomicArtFile.localTileStart) {
								foundAtomicArtFile = true;

								console.log(`Upgrading mod art file '${modArtFile.filePath}'...`);

								const upgradedArtFile = atomicArtFile.clone();
								const artFileComparison = modArtFile.compareTo(regularArtFile);

								if(artFileComparison.removed.length !== 0) {
									console.log(`Removing ${artFileComparison.removed.length} cleared tiles...`);

									for(let l = 0; l < artFileComparison.removed.length; l++) {
										const removedTile = artFileComparison.removed[l];

										upgradedArtFile.clearTile(removedTile.number);
									}
								}

								if(artFileComparison.modified.length !== 0) {
									console.log(`Replacing ${artFileComparison.modified.length} modified tiles...`);

									for(let l = 0; l < artFileComparison.modified.length; l++) {
										const modifiedTile = artFileComparison.modified[l];

										upgradedArtFile.replaceTile(modifiedTile);
										newTiles.push(modifiedTile);
									}
								}

								if(artFileComparison.new.length !== 0) {
									console.log(`Adding ${artFileComparison.new.length} new tiles...`);

									for(let l = 0; l < artFileComparison.new.length; l++) {
										const newTile = artFileComparison.new[l];

										upgradedArtFile.replaceTile(newTile);
										newTiles.push(newTile);
									}
								}

								if(artFileComparison.attributesChanged.length !== 0) {
									console.log(`Updating ${artFileComparison.attributesChanged.length} tile attributes...`);

									for(let l = 0; l < artFileComparison.attributesChanged.length; l++) {
										const tileWithChangedAttributes = artFileComparison.attributesChanged[l];

										upgradedArtFile.getTileByNumber(tileWithChangedAttributes.number).attributes = tileWithChangedAttributes.attributes;
									}
								}

								upgradedArtFiles.push(upgradedArtFile);

								break;
							}
						}

						if(!foundAtomicArtFile) {
							throw new Error(`Could not find matching atomic art file for '${modArtFile.filePath}'!`);
						}

						break;
					}

					if(!foundRegularArtFile) {
						console.warn(`Could not find matching regular art file for '${modArtFile.filePath}'! Copying art file as-is.`);

						upgradedArtFiles.push(modArtFile);
					}
				}
			}

			const upgradedArtDirectoryStats = null;

			try {
				upgradedArtDirectoryStats = fs.statSync(UPGRADED_ART_DIRECTORY);
			}
			catch(error) { }

			const newTilesDirectoryStats = null;


			try {
				newTilesDirectoryStats = fs.statSync(NEW_TILES_DIRECTORY);
			}
			catch(error) { }

			if(upgradedArtDirectoryStats || newTilesDirectoryStats) {
				console.log("Clearing output directories...");

				if(upgradedArtDirectoryStats) {
					fs.removeSync(UPGRADED_ART_DIRECTORY);
				}

				if(newTilesDirectoryStats) {
					fs.removeSync(NEW_TILES_DIRECTORY);
				}
			}

			console.log("Creating output directories...");

			fs.ensureDirSync(UPGRADED_ART_DIRECTORY);
			fs.ensureDirSync(NEW_TILES_DIRECTORY);

			console.log("Writing upgraded art files...");

			for(let i = 0; i < upgradedArtFiles.length; i++) {
				const upgradedArtFile = upgradedArtFiles[i];

				upgradedArtFile.writeTo(utilities.joinPaths(UPGRADED_ART_DIRECTORY, upgradedArtFile.filePath));
			}

			console.log("Writing new tiles...");

return callback();

			async.eachSeries(
				newTiles,
				function(newTile, callback) {
					return newTile.writeTo(
						NEW_TILES_DIRECTORY,
						true,
						TODO_PALETTE,
						"PNG",
						function(error, filePath) {
							if(error) {
								return callback(error);
							}

							return callback();
						}
					);
				},
				function(error) {
					if(error) {
						return console.error(error);
					}

					console.log("Done!");
				}
			);
		}
	],
	function(error) {
		if(error) {
			return console.error(error);
		}

		return console.log("Done!");
	}
);
