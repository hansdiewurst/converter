import { SchematicHandler } from "./schematicHandler";
import pnbt from "prismarine-nbt";

//Sometimes, the Schematic compound is in data, sometimes its simplified out
//(This is the case for .schem files, but due to the format "bug" described below, keep it anyways)
type NBTCompound<TData> = TData | {
    Schematic: TData;
};
type SchematicNBTData = NBTCompound<{
    Width: number;
    Height: number;
    Length: number;
    Blocks: number[];
    Data: number[];
}>;

export interface SchematicData {
    width: number;
    height: number;
    length: number;
    blocks: Uint8Array;
    blockData: Uint8Array;
};

export default class Handler implements SchematicHandler<SchematicData> {
    private async parse(buffer: Buffer): Promise<SchematicNBTData> {
        //parseAs return type is wrong
        const schem = await pnbt.parseAs(buffer, "big", {
            noArraySizeCheck: true
        }) as unknown as { data: pnbt.Compound };

        return pnbt.simplify(schem.data);
    };

    async parseBuffer(buffer: Buffer) {
        let schem = await this.parse(buffer);
        if("Schematic" in schem) {
            schem = schem.Schematic;
        }
        //Some .schematics use the exact same format as .schem, idk why
        //Above comment is from before rewrite, not sure if this is actually the case
        if("BlockData" in schem) throw new Error("File seems to have .schem contents");

        const blocks = new Uint8Array(schem.Blocks.length);
        const blockData = new Uint8Array(schem.Blocks.length);
        for(let i = 0; i < schem.Blocks.length; i++) {
            let id = schem.Blocks[i];
            if(id < 0) id += 256;
            blocks[i] = id;

            blockData[i] = schem.Data[i];
        }

        const json: SchematicData = {
            width: schem.Width,
            height: schem.Height,
            length: schem.Length,
            blocks,
            blockData
        };

        return json;
    };

    writeBuffer(data: SchematicData): Buffer {
        throw new Error("Writing to .schematic is currently not supported.");
    }
}