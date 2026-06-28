import { SchematicHandler } from "./schematicHandler";
import pnbt from "prismarine-nbt";
import { TypedObject } from "../types";

//According to Sponge spec: https://github.com/SpongePowered/Schematic-Specification/
type NBTData1 = {
    Version: 1;
    Width: number;
    Height: number;
    Length: number;
    PaletteMax?: number;
    Palette?: TypedObject<number>;
    BlockData: number[];

    //Unused
    Metadata?: {};
    Offset?: [ number, number, number ];
    TileEntities?: [];
};
type NBTData2 = {
    Version: 2;
    DataVersion: number;
    Width: number;
    Height: number;
    Length: number;
    PaletteMax?: number;
    Palette?: TypedObject<number>;
    BlockData: number[];

    //Unused
    Metadata?: {};
    Offset?: [ number, number, number ];
    BlockEntities?: [];
    Entities?: [];
    BiomePaletteMax?: number;
    BiomePalette?: {};
    BiomeData?: number[];
};
type NBTData3 = {
    Version: 3;
    DataVersion: number;
    Width: number;
    Height: number;
    Length: number;
    Blocks?: {
        Palette: TypedObject<number>;
        Data: number[];

        //Unused
        BlockEntities?: [];
    };

    //Unused
    Metadata?: {};
    Offset?: [ number, number, number ];
    Biomes?: {};
    Entities?: {};
};

//Sometimes, the Schematic compound is in data, sometimes its simplified out
type NBTCompound<TData> = TData | {
    Schematic: TData;
};
type SpongeNBTData = NBTCompound<NBTData1> | NBTCompound<NBTData2> | NBTCompound<NBTData3>;

export interface SpongeSchemData {
    width: number;
    height: number;
    length: number;
    blocks: Uint32Array | Uint16Array | Uint8Array;
    palette: TypedObject<number>;
};

export default class Handler implements SchematicHandler<SpongeSchemData> {
    private async parse(buffer: Buffer): Promise<SpongeNBTData> {
        //parseAs return type is wrong
        const schem = await pnbt.parseAs(buffer, "big", {
            noArraySizeCheck: true
        }) as unknown as { data: pnbt.Compound };

        return pnbt.simplify(schem.data);
    };

    async parseBuffer(buffer: Buffer): Promise<SpongeSchemData> {
        let schem = await this.parse(buffer);

        //Make `schem` data uniform idk how to call it
        if("Schematic" in schem) {
            schem = schem.Schematic;
        }

        let varIntBlocks: number[];
        let palette: TypedObject<number>;
        switch(schem.Version) {
            case 1:
            case 2:
                if(!schem.Palette) throw new Error("Schematic has no block palette.");

                varIntBlocks = schem.BlockData;
                palette = schem.Palette;
                break;
            case 3:
                if(!schem.Blocks) throw new Error("Schematic has no block container.");

                varIntBlocks = schem.Blocks.Data;
                palette = schem.Blocks.Palette;
                break;
            default: throw new Error("Unsupported schematic version.");
        }

        //Decode blocks
        const decodedBlocks = new Uint32Array(schem.Width * schem.Height * schem.Length);
        let i = 0;
        let decodedI = 0;
        while(i < varIntBlocks.length) {
            let value = 0;
            let varint_length = 0;

            while(true) {
                value |= (varIntBlocks[i] & 127) << (varint_length++ * 7);
                if (varint_length > 5) {
                    throw new Error("VarInt too big (probably corrupted data)");
                }
                if ((varIntBlocks[i] & 128) != 128) {
                    i++;
                    break;
                }
                i++;
            }

            decodedBlocks[decodedI++] = value;
        }

        const data: SpongeSchemData = {
            width: schem.Width,
            height: schem.Height,
            length: schem.Length,
            blocks: decodedBlocks,
            palette
        };
        return data;
    };

    /**
     * @param data Schem data. `data.blocks` is expected to be varint encoded
     */
    writeBuffer(data: SpongeSchemData): Buffer {
        const palette: TypedObject<pnbt.Int> = {};
        let paletteMax = 0;
        for(const key in data.palette) {
            palette[key] = pnbt.int(data.palette[key]);
            paletteMax++;
        }

        const compound = pnbt.comp({
                BlockData: pnbt.byteArray(data.blocks as unknown as number[]),
                Width: pnbt.short(data.width),
                Height: pnbt.short(data.height),
                Length: pnbt.short(data.length),
                Palette: pnbt.comp(palette),
                PaletteMax: pnbt.int(paletteMax),
                Version: pnbt.int(2),
                //Java 1.20
                DataVersion: pnbt.int(3463)
            }, "Schematic");
        return pnbt.writeUncompressed(compound as pnbt.Compound & { name: string });
    }
}