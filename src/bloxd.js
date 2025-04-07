//Read and write .bloxdschem files, mainly using avsc
const { Buffer } = require("buffer");
const avsc = require("avsc");

const schema0 = avsc.Type.forSchema({
    type: "record",
    name: "Schematic",
    fields: [
        { name: 'headers', type: { type: 'fixed', size: 4 }, default: "\u{0}\u{0}\u{0}\u{0}" },
        { name: "name", type: "string" },
        { name: "x", type: "int" },
        { name: "y", type: "int" },
        { name: "z", type: "int" },
        { name: "sizeX", type: "int" },
        { name: "sizeY", type: "int" },
        { name: "sizeZ", type: "int" },
        {
            name: "chunks",
            type: {
                type: "array",
                items: {
                    type: "record",
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
const schema1 = avsc.Type.forSchema({
    type: "record",
    name: "Schematic",
    fields: [
        { name: 'headers', type: { type: 'fixed', size: 4 }, default: "\u{1}\u{0}\u{0}\u{0}" },
        { name: "name", type: "string" },
        { name: "x", type: "int" },
        { name: "y", type: "int" },
        { name: "z", type: "int" },
        { name: "sizeX", type: "int" },
        { name: "sizeY", type: "int" },
        { name: "sizeZ", type: "int" },
        {
            name: "chunks",
            type: {
                type: "array",
                items: {
                    type: "record",
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
                    fields: [
                        { name: "blockX", type: "int" },
                        { name: "blockY", type: "int" },
                        { name: "blockZ", type: "int" },
						{ name: "blockdataStr", type: "string"}
                    ]
                }
            }
		}
    ]
});
const schema2 = avsc.Type.forSchema({
    type: "record",
    name: "Schematic",
    fields: [
        { name: 'headers', type: { type: 'fixed', size: 4 }, default: "\u{1}\u{0}\u{0}\u{0}" },
        { name: "name", type: "string" },
        { name: "x", type: "int" },
        { name: "y", type: "int" },
        { name: "z", type: "int" },
        { name: "sizeX", type: "int" },
        { name: "sizeY", type: "int" },
        { name: "sizeZ", type: "int" },
        {
            name: "chunks",
            type: {
                type: "array",
                items: {
                    type: "record",
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
                    fields: [
                        { name: "blockX", type: "int" },
                        { name: "blockY", type: "int" },
                        { name: "blockZ", type: "int" },
						{ name: "blockdataStr", type: "string"}
                    ]
                }
            }
		},
        { name: "globalX", type: "int" },
        { name: "globalY", type: "int" },
        { name: "globalZ", type: "int" }
    ]
});

const parse = function(buffer) {
    let avroJson;
    try {
        avroJson = schema2.fromBuffer(buffer);
    } catch {
        try {
            avroJson = schema1.fromBuffer(buffer);
        } catch {
            avroJson = schema0.fromBuffer(buffer);
        }
    }
    const json = {
        name: avroJson.name,
        pos: [ avroJson.x, avroJson.y, avroJson.z ],
        size: [ avroJson.sizeX, avroJson.sizeY, avroJson.sizeZ ],
        chunks: []
    };
    for(const avroChunk of avroJson.chunks) {
        const chunk = {
            pos: [ avroChunk.x, avroChunk.y, avroChunk.z ],
            blocks: []
        };

        let avroI = 0;
        function decodeLEB128() {
            let shift = 0;
            let value = 0;
        
            while(true) {
                const byte = avroChunk.blocks[avroI++];
                value |= (byte & 127) << shift;
                shift += 7;
                if((byte & 128) !== 128) {
                    break;
                }
            }
            return value;
        }
        while(avroI < avroChunk.blocks.length) {
            const amount = decodeLEB128();
            const id = decodeLEB128();
            for(let i = 0; i < amount; i++) {
                chunk.blocks.push(id);
            }
        }

        json.chunks.push(chunk);
    }

    return json;
}

const write = function(json) {
    const avroJson = {
        name: json.name,
        x: 0,
        y: 0,
        z: 0,
        sizeX: 0,
        sizeY: 0,
        sizeZ: 0,
        chunks: [],
        filler: 0
    };
    function encodeLEB128(value) {
        const bytes = new Array();
        while((value & -128) != 0) {
            let schemId = value & 127 | 128;
            bytes.push(schemId);
            value >>>= 7;
        }
        bytes.push(value);
        return bytes;
    }

    [
        avroJson.x,
        avroJson.y,
        avroJson.z
    ] = json.pos;
    [
        avroJson.sizeX,
        avroJson.sizeY,
        avroJson.sizeZ,
    ] = json.size;

    //chunk run length encoding + leb128
    for(let chunkI = 0; chunkI < json.chunks.length; chunkI++) {
        const chunk = json.chunks[chunkI];
        const avroChunk = {};
        const RLEArray = [];

        let currId = chunk.blocks[0];
        let currAmt = 1;

        for(let i = 1; i <= chunk.blocks.length; i++) {
            const id = chunk.blocks[i];
            if(id === currId) {
                currAmt++;
            } else {
                RLEArray.push(...encodeLEB128(currAmt));
                RLEArray.push(...encodeLEB128(currId));
                currAmt = 1;
                currId = id;
            }
        }

        [
            avroChunk.x,
            avroChunk.y,
            avroChunk.z
        ] = chunk.pos;
        avroChunk.blocks = Buffer.from(RLEArray);

        avroJson.chunks.push(avroChunk);
    }

    return schema0.toBuffer(avroJson);
};

module.exports = {
    parseBloxdschem: parse,
    writeBloxdschem: write
}