//Convert minecraft block-ids to bloxd block-ids and vice versa
//I apologise for below code in advance, most of it was made months ago for a seperate project.

const { b2mJson, m2bJson, idToNameJson, nameToIdJson, stairReplacements, mcNumToStrJson } = require("./block-jsons.js");

function getType(mcId) {
    const typeKeywords = {
        "trapdoor": /trapdoor/,
        "door": /door/,
        "bed": /bed(?=$|\[)/,
        "chest": /^chest/,
        "ender_chest": /ender_chest/,
        "brewing_stand": /brewing_stand/,
        "cactus": /cactus/,
        "stem": /stem/,
        "bush": /bush/,
        "farmland": /farmland/,
        "furnace": /furnace/,
        "ladder": /ladder/,
        "leaves": /leaves/,
        "y_axis": /log|wood|hay_block/,
        "block_sides": /mushroom_(block|stem)/,
        "vine": /vine/,
        "sapling": /sapling/,
        "sign": /sign/,
        "slab": /slab/,
        "tall_grass": /tall_grass/,
        "water": /water/,
        "lamp": /lamp/,
        "jukebox": /jukebox/,
        "facing": /glazed_terracotta|jack_o_lantern|^pumpkin(?!_)|attached/
    };
    for(const type in typeKeywords) {
        const regex = typeKeywords[type];
        if(mcId.match(regex))
            return type;
    }
    return "default"
}
function getAttributesForType(type) {
    const typeAttributes = {
        trapdoor: {
            facing: "south",
            half: "top",
            open: false,
            powered: false,
            waterlogged: false
        },
        door: {
            facing: "south",
            half: "lower",
            hinge: "left",
            open: false,
            powered: false
        },
        bed: {
            facing: "north",
            occupied: false,
            part: "foot"
        },
        chest: {
            facing: "south",
            type: "single",
            waterlogged: false
        },
        ender_chest: {
            facing: "south",
            waterlogged: false
        },
        brewing_stand: {
            has_bottle_0: true,
            has_bottle_1: true,
            has_bottle_2: true
        },
        cactus: {
            age: 0
        },
        stem: {
            age: 7
        },
        bush: {
            age: 3
        },
        farmland: {
            moisture: 0
        },
        furnace: {
            facing: "south",
            lit: false
        },
        ladder: {
            facing: "south",
            waterlogged: false
        },
        leaves: {
            distance: 7,
            persistent: true,
            waterlogged: false
        },
        y_axis: {
            axis: "y"
        },
        block_sides: {
            east: true,
            down: true,
            north: true,
            south: true,
            up: true,
            west: true
        },
        sapling: {
            stage: 0
        },
        sign: {
            facing: "south",
            waterlogged: false
        },
        slab: {
            type: "bottom",
            waterlogged: false
        },
        tall_grass: {
            half: "lower"
        },
        vine: {
            east: false,
            north: false,
            south: false,
            up: false,
            west: false
        },
        water: {
            level: 0
        },
        lamp: {
            lit: false
        },
        jukebox: {
            has_record: false
        },
        stairs: {
            facing: "south",
            half: "bottom",
            shape: "straight",
            waterlogged: false
        },
        facing: {
            facing: "south"
        },
        default: {}
    };
    return typeAttributes[type];
}
function getFacing(name, invertRot) {
    const rotationIdx = parseInt(name.match(/(?<=meta\|rot)[2-4]/)?.[0]);
    if(rotationIdx) {
        const faceDirs = invertRot ? ["north", "west", "south", "east"] : ["south", "east", "north", "west"];
        return faceDirs[rotationIdx - 1];
    }
}

const b2mCache = {};
const bloxdToMcId = function(bloxdId) {
    const cachedMcId = b2mCache[bloxdId];
    if(cachedMcId) {
        return cachedMcId;
    }

    let bloxdName = idToNameJson[bloxdId];
    const attributeOverrides = {};

    if (bloxdName.includes("Wheat")) {
        const wheatStages = [
            "Wheat Seeds",
            "Wheat_stage1",
            "Wheat_stage2",
            "Wheat_stage3",
            "Wheat_stage4",
            "Wheat_stage5",
            "Wheat|FreshlyGrown"
        ];
        attributeOverrides.age = wheatStages.indexOf(bloxdName) + 1;
        bloxdName = "Wheat";
    } else if (bloxdName.includes("|Top")) {
        attributeOverrides.half = "upper";
    } else if (bloxdName.startsWith("_")) {
        if (bloxdName.includes(" Top")) {
            attributeOverrides.half = "upper";
        } else if (bloxdName.includes(" Head")) {
            attributeOverrides.part = "head";
        }
        bloxdName = bloxdName.replace(/_|\s+Top|\s+Head/g, "");
    }

    const baseName = bloxdName.split("|")[0];
    let mcId = `minecraft:${b2mJson[baseName] || "dirt"}`;
    let type = getType(mcId);

    if (mcId.includes("slab") && bloxdName.includes("|side")) {
        type = "stairs";
        mcId = mcId.replace("slab", "stairs");
    }
    const attributes = getAttributesForType(type);
    Object.assign(attributes, attributeOverrides);

    const invertTypes = ["bed", "attached"];
    const facing = getFacing(bloxdName, invertTypes.includes(type));
    if(facing && attributes.hasOwnProperty("facing")) {
        attributes.facing = facing;
    }

    if(attributes.hasOwnProperty("open")) {
        attributes.open = bloxdName.includes("|open");
    }
    if (type === "slab") {
        attributes.type = bloxdName.includes("|top") ? "top" : "bottom";
    } else if (type === "vine" && attributes.hasOwnProperty("facing")) {
        attributes[facing] = true;
    }

    let attrStr = "[";
    for(const key in attributes) {
        attrStr += `${key}=${attributes[key]},`;
    }
    attrStr = (attrStr + "]").replace(/\,(?=\])|\[\]/g, "");
    mcId += attrStr;

    b2mCache[bloxdId] = mcId;
    return mcId;
};


function getBlockstates(name) {
    if (!name.includes("[")) {
        return {};
    }
    const blockstates = {};
    const blockstateStr = name.split("[")[1].replace("]", "");
    for(const pair of blockstateStr.split(",")) {
        const split = pair.split("=");
        blockstates[split[0]] = split[1];
    };
    return blockstates;
}

//No caching as the function is only being called once for each block in the palette.
const mcToBloxdId = function(mcId) {
    mcId = mcId.replace(/minecraft:|potted_|flowing_|infested_|_pane|(_gate|_wall)(?=$|\[)|_powder|.*(?=sign(?=$|\[))/g, "").replace("fence", "planks").replace(/brick(?=$|\[)/g, "bricks");
    if(mcId.match(/_(button|head|skull|pot|banner)|candle|cake|rail|torch(?=$|\[)|pressure_plate|coral(?!_block)/)) {
        return 0;
    }

    let blockstates = getBlockstates(mcId);
    //Replace stairs and double slabs with full blocks
    if(mcId.includes("stairs") || (mcId.includes("slab") && blockstates.type === "double")) {
        const fullBlock = mcId.split("[")[0].replace(/_(stairs|slab)/g, "");
        mcId = stairReplacements[fullBlock] || fullBlock;
        blockstates = {};
    }

    let bloxdId = m2bJson[mcId.split("[")[0]];
    let baseName = idToNameJson[bloxdId];
    let metaStr = "";

    if(!baseName) {
        console.log(`Setting ${mcId} to dirt.`);
        return 2;
    }

    const sides = {
        north: 1,
        east: 2,
        south: 3,
        west: 4,
        up: 3
    };
    const invertedSides = {
        north: 3,
        east: 4,
        south: 1,
        west: 2,
        up: 1
    };
    let useInvertedSides = false;

    if(mcId.includes("vine")) {
        for(const stateName in blockstates) {
            if(sides.hasOwnProperty(stateName) && blockstates[stateName] === "true") {
                useInvertedSides = true;
                blockstates = {
                    facing: stateName
                };
                break;
            }
        }
    }
 
    if(blockstates.half === "upper") {
        if(mcId.includes("door")) {
            baseName = `_${baseName} Top`;
        } else if(baseName === "Tall Grass") {
            metaStr = "|Top";
        }
    } else if(blockstates.part) {
        if(blockstates.part === "head") {
            baseName = `_${baseName} Head`;
        }
        useInvertedSides = true;
    }
    
    if(mcId.includes("slab") && blockstates.type === "top") {
        metaStr = "|meta|rot1|top";
    } else if(blockstates.facing) {
        const rot = useInvertedSides ? invertedSides[blockstates.facing] : sides[blockstates.facing];

        metaStr = `|meta|rot${rot}`;
        if(blockstates.hasOwnProperty("open")) {
            metaStr += blockstates.open === "true" ? "|open" : "|closed";
        }
    }    
    metaStr = metaStr.replace(/\|meta\|rot1(?=$)/, "");

    //Dirt as fallback, might not be necessary
    return nameToIdJson[baseName + metaStr] ?? nameToIdJson[baseName] ?? 2;
}

const mcNumToStr = function(block, data) {
    let name = mcNumToStrJson[`${block}:${data}`] || mcNumToStrJson[block] || "minecraft:dirt";

    //Names without the "minecraft:"-prefix are to be replaced with metadata blocks
    if(name.startsWith("minecraft:")) {
        return name;
    }

    //metadata
    const facings = [
        "south",
        "west",
        "north",
        "east"
    ];
    const facings2 = [
        "north",
        "south",
        "west",
        "east"
    ];
    const woodPrefixes = [
        "oak",
        "spruce",
        "birch",
        "jungle",
        "acacia",
        "dark_oak"
    ];

    //Not very elegant, but at least quite clearly structured
    if(name === "farmland") {
        name += `[age=${data}]`;
    } else if(
        name === "anvil" ||
        name.endsWith("_glazed_terracotta") ||
        name === "pumpkin" ||
        name === "jack_o_lantern"
    ) {
        name += `[facing=${facings[data % 4]}]`;
    } else if(
        name === "command_block" ||
        name === "observer" ||
        name === "ladder" ||
        name === "furnace" ||
        name.endsWith("chest")
    ) {
        data %= 8;
        if(data >= 2 && data <= 5) {
            name += `[facing=${facings2[data - 2]}]`;
        }
    } else if(name === "bed") {
        const part = data >= 8 ? "head" : "foot";
        name = `red_bed[facing=${facings[data % 8]},part=${part}]`;
    } else if(name === "oak_trapdoor" || name === "iron_trapdoor") {
        data %= 8;
        const isOpen = data >= 4;
        name += `[facing=${facings[data % 4]},open=${isOpen}]`;
    } else if(
        name === "wool" ||
        name === "stained_glass" ||
        name === "stained_glass_pane" ||
        name === "terracotta" ||
        name === "carpet" ||
        name === "concrete" ||
        name === "concrete powder"
    ) {
        const colors = [
            "white",
            "orange",
            "magenta",
            "light_blue",
            "yellow",
            "lime",
            "pink",
            "gray",
            "light_gray",
            "cyan",
            "purple",
            "blue",
            "brown",
            "green",
            "red",
            "black"
        ];
        name = `${colors[data]}_${name}`;
    } else if(name === "double_plant") {
        //TODO: Halfs, docs are unclear and cubical doesn't support it at all
        if(data <= 5) {
            const plantTypes = [
                "sunflower",
                "lilac",
                "tall_grass",
                "large_fern",
                "rose_bush",
                "peony"
            ];
            name = plantTypes[data];
        }
    } else if(name === "planks" || name === "sapling") {
        name = `${woodPrefixes[data % 8]}_${name}`;
    } else if(name === "wooden_slab" || name === "double_wooden_slab") {
        const type = name.startsWith("double_") ? "double" : data >= 8 ? "top" : "bottom";
        name = `${woodPrefixes[data % 8]}_slab[type=${type}]`;
    } else if(name === "stone_slab" || name === "double_stone_slab") {
        data %= 8;
        const stoneSlabPrefixes = [
            "stone",
            "sandstone",
            "petrified_oak",
            "cobblestone",
            "brick",
            "stone_brick",
            "nether_brick",
            "quartz",
            "red_sandstone"
        ];
        if(name.endsWith("2")) {
            data += 8;
            name = name.substring(0, name.length - 1);
        }
        const type = name.startsWith("double_") ? "double" : data >= 8 ? "top" : "bottom";
        name = `${stoneSlabPrefixes[data]}_slab[type=${type}]`;
    } else if(name === "purpur_slab") {
        const type = data === 8 ? "top" : "bottom";
        name  = `purpur_slab[type=${type}]`;
    } else if(name.startsWith("leaves") || name.startsWith("log")) {
        data %= 4;
        if(name.endsWith("2")) {
            data += 4;
            name = name.substring(0, name.length - 1);
        }
        name = `${woodPrefixes[data]}_${name}`;
    } else if(name === "vines") {
        //TODO
    } else if(name.endsWith("_mushroom_block")) {
        //TODO
    } else if(name.endsWith("sandstone")) {
        const sandstonePrefixes = [
            "",
            "chiseled",
            "smooth"
        ];
        name = `${sandstonePrefixes[data]}_${name}`.replace(/(?<=^)_/, "");
    } else if(name.endsWith("_door")) {
        const half = data >= 8 ? "upper" : "lower";
        name += `[half=${half}]`;
    }

    return `minecraft:${name || "dirt"}`;
};

module.exports = {
    mcToBloxdId: mcToBloxdId,
    bloxdToMcId: bloxdToMcId,
    mcNumToStr: mcNumToStr
}