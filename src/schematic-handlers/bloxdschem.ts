import { Type } from "avsc";
import { SchematicHandler } from "./schematicHandler";

export interface Chunk {
    x: number,
    y: number,
    z: number,
    blocks: number[]
};
export interface BloxdschemData {
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    length: number,
    chunks: Chunk[]
};

export default class Handler implements SchematicHandler<BloxdschemData> {
    private static lightSchema = Type.forSchema({
        type: "record",
        name: "Schematic",
        fields: [
            { name: "name", type: "string" },
            { name: "x", type: "int" },
            { name: "y", type: "int" },
            { name: "z", type: "int" },
            { name: "width", type: "int" },
            { name: "height", type: "int" },
            { name: "length", type: "int" },
            {
                name: "chunks",
                type: {
                    type: "array",
                    items: {
                        type: "record",
                        name: "chunk",
                        fields: [
                            { name: "x", type: "int" },
                            { name: "y", type: "int" },
                            { name: "z", type: "int" },
                            { name: "blocks", type: "bytes" }
                        ]
                    }
                }
            }
        ]
    });
    private static fullSchema = Type.forSchema({
        type: "record",
        name: "Schematic",
        fields: [
            { name: 'headers', type: { name: "headers", type: 'fixed', size: 4 }, default: "\u{4}\u{0}\u{0}\u{0}" },
            { name: "name", type: "string" },
            { name: "x", type: "int" },
            { name: "y", type: "int" },
            { name: "z", type: "int" },
            { name: "width", type: "int" },
            { name: "height", type: "int" },
            { name: "length", type: "int" },
            {
                name: "chunks",
                type: {
                    type: "array",
                    items: {
                        type: "record",
                        name: "chunk",
                        fields: [
                            { name: "x", type: "int" },
                            { name: "y", type: "int" },
                            { name: "z", type: "int" },
                            { name: "blocks", type: "bytes" }
                        ]
                    }
                }
            },
            {
                name: "blockdatas",
                type: {
                    type: "array",
                    items: {
                        type: "record",
                        name: "blockdata",
                        fields: [
                            { name: "blockX", type: "int" },
                            { name: "blockY", type: "int" },
                            { name: "blockZ", type: "int" },
                            { name: "blockdataStr", type: "string"}
                        ]
                    }
                },
                default: []
            },
            { name: "globalX", type: "int", default: 0 },
            { name: "globalY", type: "int", default: 0 },
            { name: "globalZ", type: "int", default: 0 },
            {
                name: "worldcode",
                type: [
                    "null",
                    {
                        type: "record",
                        name: "worldcode",
                        fields: [
                            { name: "code", type: "string", default: "" },
                            { name: "dbId", type: "string", default: "" },
                            //idk what these mean, but they seem to be integers
                            { name: "someint", type: "int", default: 0},
                            { name: "someotherint", type: "int", default: 0},
                        ]
                    }
                ],
                default: null
            },
            //Maybe exported world flag?
            { name: "somebool", type: "boolean", default: false }
        ]
    });
    private static resolver = Handler.lightSchema.createResolver(Handler.fullSchema);

    async parseBuffer(buffer: Buffer): Promise<BloxdschemData> {
        const data: BloxdschemData = Handler.lightSchema.fromBuffer(buffer, Handler.resolver, true);

        //Decode blocks
        for(const chunk of data.chunks) {
            const blocks = new Array(32**3);

            let encodedI = 0;
            let blockI = 0;
            function decodeVarInt() {
                let value = 0;
                let varint_length = 0;

                while (true) {
                    const byte = chunk.blocks[encodedI++];
                    value |= (byte & 127) << (varint_length++ * 7);

                    if (varint_length > 5) {
                        throw new Error("VarInt too big (probably corrupted data)");
                    }

                    if ((byte & 128) != 128) {
                        break;
                    }
                }

                return value;
            }
            while(encodedI < chunk.blocks.length) {
                const amount = decodeVarInt();
                const id = decodeVarInt();
                for(let i = 0; i < amount; i++) {
                    blocks[blockI++] = id;
                }
            }

            chunk.blocks = blocks;
        }

        return data;
    }

    writeBuffer(data: BloxdschemData): Buffer {
        function encodeVarInt(value: number) {
            const bytes = new Array();
            while(value >= 128) {
                let schemId = value & 127 | 128;
                bytes.push(schemId);
                value >>>= 7;
            }
            bytes.push(value);
            return bytes;
        }

        //Encode blocks
        for(let chunkI = 0; chunkI < data.chunks.length; chunkI++) {
            const chunk = data.chunks[chunkI];
            const RLEArray: number[] = [];

            let currId = chunk.blocks[0];
            let currAmt = 1;

            for(let i = 1; i <= chunk.blocks.length; i++) {
                if(chunk.blocks[i] === currId) {
                    currAmt++;
                } else {
                    //TODO: RLEArray of fixed length
                    RLEArray.push(...encodeVarInt(currAmt), ...encodeVarInt(currId));

                    currAmt = 1;
                    currId = chunk.blocks[i];
                }
            }

            //Lie to typescript, because avsc needs Buffer but I'm not making a seperate interface to change 1 type
            chunk.blocks = Buffer.from(RLEArray) as unknown as number[];
        }

        const buffer = Handler.fullSchema.toBuffer(data);
        return buffer;
    };
}