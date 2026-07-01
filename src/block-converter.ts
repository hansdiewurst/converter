//Convert minecraft block-ids to bloxd block-ids and vice versa
import { b2mJSON, m2bJSON, idToNameJSON, nameToIdJSON, stairReplacements, legacyToMcIdJSON } from "./block-jsons";
import { LitematicBlock } from "./schematic-handlers/litematic";
import type { GenericObject } from "./types";
import { UIHandler } from "./UI";

type BloxdBlockId = number;
type BloxdBlockName = string;
type BloxdMetadata = {
    rotation: number,
    opened: boolean,
    halfblockPlacement: string,
    plantTop: boolean,
    blockLoc: string[],
    growingStage: number
};

type BloxdMetaKey = keyof BloxdMetadata;
type MetaConfigItem<K extends BloxdMetaKey> = {
    name: K;
    regex: RegExp;
    needs?: BloxdMetaKey;
    default: BloxdMetadata[K];
    global?: boolean;
    order?: number;
    getValue(this: BlockConverter, str: string): BloxdMetadata[K];
    writeValue(this: BlockConverter, val: BloxdMetadata[K], name: string): string;
    cleanName?(this: BlockConverter, name: string, val: BloxdMetadata[K]): string;
};
type BloxdMetaConfig = {
    [K in BloxdMetaKey]: MetaConfigItem<K>
};

type MinecraftBlockId = string;
type MinecraftBlockType = 
    | "trapdoor"
    | "door"
    | "bed"
    | "chest"
    | "ender_chest"
    | "brewing_stand"
    | "cactus"
    | "stem"
    | "bush"
    | "farmland"
    | "furnace"
    | "ladder"
    | "leaves"
    | "y_axis"
    | "block_sides"
    | "sapling"
    | "sign"
    | "slab"
    | "tall_grass"
    | "vine"
    | "water"
    | "lamp"
    | "jukebox"
    | "stairs"
    | "facing"
    | "default";
type MinecraftBlockStates = GenericObject;

enum FacingRotation {
    north = 1,
    east,
    south,
    west
}
enum FacingRotationInv {
    south = 1,
    west,
    north,
    east
}

class Prompter {
    private storageKeys = {
        minecraft: "stored-mc",
        bloxd: "stored-bloxd"
    };
    UI: UIHandler;
    constructor(UI: UIHandler) {
        this.UI = UI;
        for(const type in this.storageKeys) {
            const key = this.storageKeys[type];
            let item = localStorage.getItem(key);
            let parsed: Object | null = null;
            try { parsed = JSON.parse(item ?? "") } catch {}
            if(!parsed) {
                parsed = {};
                localStorage.setItem(key, "{}");
            }

            this.storedBlocks[type] = parsed;
        }
    }

    private store(type: "minecraft" | "bloxd", from: string, to: string) {
        this.storedBlocks[type][from] = to;
        localStorage.setItem(this.storageKeys[type], JSON.stringify(this.storedBlocks[type]));
    }

    /** Manual conversions are of cleaned up blocks, meaning getUserBlock could get called multiple times for the same block because of different blockstates/meta */
    private cache = new Map<BloxdBlockName | MinecraftBlockId, BloxdBlockName | MinecraftBlockId>;
    private blockIdLists = {
        //m2bJSON isnt an exhaustive list, so maybe have a seperate array of all ids?
        minecraft: new Set(Object.keys(m2bJSON)),
        bloxd: new Set(Object.keys(nameToIdJSON))
    };
    private repeatBlocks: Record<string, BloxdBlockName | null> = {
        minecraft: null,
        bloxd: null
    };
    private storedBlocks: Record<string, Object> = {};

    async getUserBlock(fromBlock: string, toType: "minecraft" | "bloxd") {
        if(this.repeatBlocks[toType]) return this.repeatBlocks[toType];
        if(fromBlock in this.storedBlocks[toType]) return this.storedBlocks[toType][fromBlock];
        if(this.cache.has(fromBlock)) return this.cache.get(fromBlock)!;

        const fromType = toType === "minecraft" ? "bloxd" : "minecraft";
        return new Promise<string>((resolve) => {
            this.UI.prompt(
                "Block Conversion",
                `Choose conversion from ${fromType}-id '${fromBlock}' to ${toType}:`,
                (value, repeat, save) => {
                    if(!this.blockIdLists[toType].has(value)) return false;
                    if(repeat) this.repeatBlocks[toType] = value;
                    else if(save) this.store(toType, fromBlock, value);

                    this.cache.set(fromBlock, value);
                    //delay in order for ui to be removed before further processing
                    setTimeout(() => resolve(value), 1);
                    return true;
                }
            );
        });
    }
}

export default class BlockConverter {
    private b2mCache = new Map<BloxdBlockId, MinecraftBlockId>;
    private m2bCache = new Map<MinecraftBlockId, BloxdBlockId>;

    constructor(UI: UIHandler) {
        this.prompter = new Prompter(UI);
    }
    private prompter: Prompter;
    async getUserBlock(fromBlock: string, toType: "minecraft" | "bloxd") {
        return this.prompter.getUserBlock(fromBlock, toType);
    }

    //Minecraft helpers
    private static minecraftTypeConfig: Record<MinecraftBlockType, Record<string,any>> = {
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
    private getMcType(mcId: MinecraftBlockId): MinecraftBlockType {
        const typeKeywords: Partial<Record<MinecraftBlockType, RegExp>> = {
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
            "stairs": /stairs/,
            "facing": /glazed_terracotta|jack_o_lantern|^pumpkin(?!_)|attached|wall_torch/
        };

        for(const type in typeKeywords) {
            const regex = typeKeywords[type];

            if(mcId.match(regex)) return type as MinecraftBlockType;
        }

        return "default"
    }
    private getBlockstatesForType(type: MinecraftBlockType) {
        return BlockConverter.minecraftTypeConfig[type];
    }
    private parseBlockstates(name: MinecraftBlockId): MinecraftBlockStates {
        if (!name.includes("[")) {
            return {};
        }

        const states: MinecraftBlockStates = {};
        const stateString = name.match(/(?<=\[).*(?=\]$)/g)?.[0];
        if(!stateString) return {};

        for(const pair of stateString.split(",")) {
            const [ key, value ] = pair.split("=");
            states[key] = value;
        };
        return states;
    }
    private stringifyBlockstates(states: MinecraftBlockStates) {
        const pairs = Object.entries(states).map(([key, value]) => `${key}=${value}`);
        return pairs.length === 0 ? "" : `[${pairs.join(",")}]`;
    }
    private trimMcId(name: MinecraftBlockId): MinecraftBlockId {
        return name.split("[")[0];
    }

    //Bloxd helpers
    private blockLocTerms = ["Top", "Bottom", "Left", "Right", "Head", "Mid", "Flag"];
    // https://github.com/Bloxdy/code-api/blob/main/BLOCK_NAMES.txt
    // Only relevant ones implemented here
    private bloxdMetaConfig: BloxdMetaConfig = {
        rotation: {
            name: "rotation",
            regex: /^meta\|rot[1-4]$/,
            default: 1,
            order: 1,
            getValue(str: string) {
                return Number(str.match(/[1-4]/));
            },
            writeValue(val: number, name: string) {
                return `${name}|meta|rot${val}`;
            }
        },
        opened: {
            name: "opened",
            regex: /^open|closed$/,
            default: false,
            needs: "rotation",
            getValue(str: string) {
                return str === "open";
            },
            writeValue(val: boolean, name: string) {
                return `${name}|${val ? "open" : "closed"}`;
            }
        },
        halfblockPlacement: {
            name: "halfblockPlacement",
            regex: /^top|bot|side$/,
            default: "bot",
            needs: "rotation",
            getValue(str: string) {
                return str;
            },
            writeValue(val: string, name: string) {
                return `${name}|${val}`;
            }
        },
        plantTop: {
            name: "plantTop",
            regex: /^Top$/,
            default: false,
            getValue(str: string) {
                return true;
            },
            writeValue(val: boolean, name: string) {
                return `${name}${val ? "|Top" : ""}`;
            }
        },
        blockLoc: {
            name: "blockLoc",
            regex: /^_/,
            default: [],
            global: true,
            order: 2,
            getValue(str: string) {
                const parts = str.split("|")[0].split(" ");
                const locTerms: string[] = [];
                for(const part of parts) {
                    const isTerm = this.blockLocTerms.includes(part);

                    if(!isTerm) {
                        if(locTerms.length) return [];
                        else continue;
                    } else {
                        locTerms.push(part);
                    }
                }
                return locTerms;
            },
            writeValue(val: string[], name: string) {
                return val.length ? `_${name}${val.map(a=>" "+a).join("")}` : name;
            },
            cleanName(name: string, val: string[]) {
                return name.replace(/^_/, "").replace(val.map(a=>" "+a).join(""), "");
            }
        },
        growingStage: {
            name: "growingStage",
            regex: /_stage\d+($|\|)/,
            default: 1,
            global: true,
            order: 3,
            getValue(str: string): number {
                const match = str.split("|")[0].match(/(?<=_stage)\d+$/)
                const stage = parseInt(match?.[0] ?? "");

                return stage;
            },
            writeValue(val: number, name: string) {
                return `${name}_stage${val}`;
            },
            cleanName(name: string, val: number) {
                return name.replaceAll(`_stage${val}`, "");
            }
        }
    };
    private parseBloxdMetadata(name: BloxdBlockName): Partial<BloxdMetadata> {
        const metadata: Partial<BloxdMetadata> = {};

        const meta = name.split(/(?<!meta)\|/).slice(1);
        for(const key in this.bloxdMetaConfig) {
            const config = this.bloxdMetaConfig[key as BloxdMetaKey];

            if(config.global) {
                if(config.regex.test(name)) {
                    // @ts-ignore
                    metadata[config.name] = config.getValue.call(this, name);
                }
                continue;
            }

            for(const match of meta) {
                if(!config.regex.test(match)) continue;

                // @ts-ignore
                metadata[config.name] = config.getValue.call(this, match);
                break;
            }
        }

        return metadata;
    }
    private stringifyBloxdMetadata(name: BloxdBlockName, metadata: Partial<BloxdMetadata>): string {
        //If all |-like metadata (= non-global) is default, its removed
        let allDefault = true;
        for(const key in metadata) {
            const config = this.bloxdMetaConfig[key as BloxdMetaKey];
            if(!config.global && metadata[key] !== config.default)  {
                allDefault = false;
                break;
            }
        }
        if(allDefault) {
            for(const key in metadata) {
                if(!this.bloxdMetaConfig[key].global) delete metadata[key];
            }
        }

        //Fill required metadata
        for(const key in metadata) {
            const config = this.bloxdMetaConfig[key as BloxdMetaKey];
            const needs = config.needs;

            if(needs && !(needs in metadata)) {
                (metadata as GenericObject)[needs] = this.bloxdMetaConfig[needs].default;
            }
        }

        //Sort metadata and write to block name
        const configs: any[] = [];
        for(const key in metadata) {
            const config = this.bloxdMetaConfig[key as BloxdMetaKey];
            configs.push({ config, order: config.order ?? 0 });
        }
        const sorted = configs.sort((a, b) => b.order - a.order);
        for(const { config } of sorted) {
            name = config.writeValue(metadata[config.name], name);
        }

        return name;
    }
    private cleanBloxdName(name: BloxdBlockName, metadata?: Partial<BloxdMetadata>): BloxdBlockName {
        metadata ??= this.parseBloxdMetadata(name);

        //"normal" meta
        name = name.split("|")[0];
        //cleanup functions for global metas
        for(const key in this.bloxdMetaConfig) {
            if(!(key in metadata)) continue;

            const item = this.bloxdMetaConfig[key] as MetaConfigItem<any>;
            const cleanName = item.cleanName?.call(this, name, metadata[key]);
            if(cleanName) name = cleanName;
        }

        return name;
    }
    private rotToFacing(rot: number, invert: boolean): string {
        return invert ? FacingRotationInv[rot] : FacingRotation[rot];
    }
    private facingToRot(facing: string, invert: boolean): number {
        return invert ? FacingRotationInv[facing] : FacingRotation[facing];
    }

    //Conversion
    //TODO: if eg. |rot1 is omitted as its default meta, generated blockstates may be off
    //so keep a list of what blocks have what meta and apply defaults for meta thats not in name
    async bloxdToMc(bloxdId: BloxdBlockId): Promise<MinecraftBlockId> {
        if(bloxdId === 0) return "minecraft:air";
        if(this.b2mCache.has(bloxdId)) return this.b2mCache.get(bloxdId)!;

        let bloxdName: BloxdBlockName = idToNameJSON[bloxdId] ?? "Dirt";
        const metadata = this.parseBloxdMetadata(bloxdName);
        const cleanBloxdName = this.cleanBloxdName(bloxdName, metadata);

        let mcId: MinecraftBlockId = b2mJSON[bloxdName] ?? b2mJSON[cleanBloxdName];
        bloxdName = cleanBloxdName;
        if(!mcId) {
            mcId = await this.getUserBlock(bloxdName, "minecraft");
        }

        if(mcId === "torch" && metadata.halfblockPlacement === "side") {
            mcId = "wall_torch";
        }
        let mcType = this.getMcType(mcId);

        //Attribute overrides
        const stateOverrides: MinecraftBlockStates = {};

        if(metadata.plantTop || metadata.blockLoc?.includes("Top")) {
            stateOverrides.half = "upper";
        } else if(metadata.blockLoc?.includes("Head")) {
            stateOverrides.part = "head";
        }

        if(metadata.rotation) {
            const invertTypes = ["bed", "attached"];
            const facing = this.rotToFacing(metadata.rotation, invertTypes.includes(mcType));

            if (mcType === "vine") stateOverrides[facing] = true;
            else stateOverrides.facing = facing;
        }

        stateOverrides.open = !!metadata.opened;

        if(mcType === "slab") {
            switch(metadata.halfblockPlacement ?? this.bloxdMetaConfig["halfblockPlacement"].default) {
                case "side": {
                    mcType = "stairs";
                    //TODO: Does this always work?
                    mcId = mcId.replace("slab", "stairs");
                    break;
                }
                case "top": {
                    stateOverrides.type = "top";
                    break;
                }
                case "bot": {
                    stateOverrides.type = "bottom";
                    break;
                }
                default: {
                    //Cant happen
                    console.error(`Unrecognised halfblock placement: ${metadata.halfblockPlacement} ${mcId} ${bloxdName}`);
                }
            }
        }

        //Assign attributes
        const defaultBlockstates = this.getBlockstatesForType(mcType);
        const idBlockstates = this.parseBlockstates(mcId);
        const blockstates = {
            ...defaultBlockstates,
            ...idBlockstates
        };
        for(const name in stateOverrides) {
            if(name in blockstates) blockstates[name] = stateOverrides[name];
        }

        //Done
        mcId = `minecraft:${this.trimMcId(mcId)}${this.stringifyBlockstates(blockstates)}`;

        this.b2mCache.set(bloxdId, mcId);
        return mcId;
    }

    async mcToBloxd(mcId: MinecraftBlockId): Promise<BloxdBlockId> {
        if(mcId === "minecraft:air" || mcId === "air") return 0;
        if(this.m2bCache.has(mcId)) return this.m2bCache.get(mcId)!;

        const origMcId = mcId;
        //Clean up id
        mcId = origMcId
            .replace(/minecraft:|potted_|flowing_|infested_|_pane|(_gate|_wall)(?=$|\[)|_powder|.*(?=sign(?=$|\[))/g, "")
            .replace("fence", "planks")
            .replace(/brick(?=$|\[)/g, "bricks");

        if(/_(button|head|skull|pot)|candle|cake|rail|pressure_plate|coral(?!_block)/.test(mcId)) {
            return 0;
        }
        //TODO: Banners (the fact that they have _Flag, |top, |bot, and |side is confusing)

        let blockstates = this.parseBlockstates(mcId);
        let cleanMcId = this.trimMcId(mcId);
        const mcType = this.getMcType(cleanMcId);

        //Replace stairs, double slabs with full blocks
        //This isnt very nice but it works
        if(mcType === "stairs" || (mcType === "slab" && blockstates.type === "double")) {
            const fullBlock = cleanMcId.replace(/_(stairs|slab)/g, "");
            cleanMcId = stairReplacements[fullBlock] || fullBlock;
            blockstates = {};
        }

        let bloxdName = m2bJSON[mcId] ?? m2bJSON[cleanMcId];
        mcId = cleanMcId;
        if(!bloxdName) {
            bloxdName = await this.getUserBlock(mcId, "bloxd");
        }
        const cleanBloxdName = this.cleanBloxdName(bloxdName);

        //Convert blockstates to bloxd metadata
        let useInvertedFacing = false;

        const metadata: Partial<BloxdMetadata> = this.parseBloxdMetadata(bloxdName);
        const blockLoc = new Set<string>();

        if(mcType === "vine") {
            for(const stateName in blockstates) {
                if(blockstates[stateName] !== "true" || !(stateName in FacingRotation)) continue;

                useInvertedFacing = true;
                blockstates.facing = stateName;
                break;
            }
        }

        if(blockstates.half === "upper") {
            if(bloxdName.includes("Door")) blockLoc.add("Top");
            else if(bloxdName === "Tall Grass") metadata.plantTop = true;
        }

        if(blockstates.part) {
            if(blockstates.part === "head") blockLoc.add("Head");
            useInvertedFacing = true;
        }

        if(mcType === "slab" && blockstates.type === "top") {
            metadata.rotation = 1;
            metadata.halfblockPlacement = "top";
        }

        if(blockstates.facing) {
            const rot = this.facingToRot(blockstates.facing, useInvertedFacing);
            metadata.rotation = rot;
        }

        if("open" in blockstates) {
            metadata.opened = blockstates.open === "true";
        }

        //Done
        metadata.blockLoc = Array.from(blockLoc);
        const fullName = this.stringifyBloxdMetadata(cleanBloxdName, metadata);
        console.log(bloxdName, cleanBloxdName, metadata, fullName);
        let bloxdId = nameToIdJSON[fullName] ?? nameToIdJSON[bloxdName] ?? nameToIdJSON[cleanBloxdName];
        if(!bloxdId) {
            //TODO: maybe prompt here too
            console.warn("Failed to convert mc to bloxd, using dirt");
            bloxdId = 2;
        }

        this.m2bCache.set(origMcId, bloxdId);
        return bloxdId;
    }

    stringifyLitematicBlock(block: LitematicBlock) {
        let name = block.Name;
        if(block.Properties) name += this.stringifyBlockstates(block.Properties);

        return name;
    }
    /** Convert legacy .schematic block ids to modern minecraft block ids */
    legacyToMcId(block: number, data: number) {
        //No caching because its literally just a lookup
        const name = legacyToMcIdJSON[`${block}:${data}`] || legacyToMcIdJSON[`${block}:0`] || "minecraft:dirt";
        return name;
    }
}

(window as any).BlockConverter = BlockConverter;