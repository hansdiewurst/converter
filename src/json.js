//Convert between the read .schem and .bloxdschem files
const pnbt = require("prismarine-nbt");
const { bloxdToMcId, mcToBloxdId } = require("./block-conversion.js");

function posToIdxBloxd(pos, size) {
    return pos[0] * size[1] * size[2] + pos[1] * size[2] + pos[2];
}
function posToIdxMc(pos, size) {
    return (pos[1] * size[2] + pos[2]) * size[0] + pos[0];
}

const b2m = function(bloxdJson) {
    function encodeLEB128(value) {
        const bytes = new Array();
        while((value & -128) != 0) {
            let schemId = value & 127 | 128;
            //Because of pnbt
            if (schemId >= 128) {
                schemId -= 256;
            }
            bytes.push(schemId);
            value >>>= 7;
        }
        bytes.push(value);
        return bytes;
    }

    const { chunks } = bloxdJson;
    const startPos = chunks[0].pos;
    const endPos = chunks[chunks.length - 1].pos;
    //Ignore end (and start) offset because I'm lazy; only convert full chunks
    const size = endPos.map((endCoord, i) => (endCoord + 1 - startPos[i]) * 32);
    bloxdJson.size = size;

    //blocks
    const paletteArr = [];
    const palette = {};
    let blocks = new Array(size[0] * size[1] * size[2]);

    for(const chunk of chunks) {
        let blockI = posToIdxMc(chunk.pos.map(coord => coord * 32), size);
        let chunkI = 0;

        //blockI increase per 1 increase of given coordinate
        const zBlockIInc = size[0] - 32;
        const yBlockIInc = size[0] * (size[2] - 32);

        for(let y = 0; y < 32; y++) {
            for(let z = 0; z < 32; z++) {
                for(let x = 0; x < 32; x++) {
                    //Unoptimized but needed, as multiple bloxd block-ids can map to the same minecraft block-id.
                    //Caching happening within the function
                    const block = bloxdToMcId(chunk.blocks[chunkI]);
                    if(!paletteArr.includes(block)) {
                        paletteArr.push(block);
                    }
                    let paletteI = paletteArr.indexOf(block);
                    if((paletteI & -128) != 0) {
                        const encoded = encodeLEB128(paletteI);
                        blocks.splice(blockI, 1, ...encoded);
                        blockI += encoded.length;
                    } else {
                        blocks[blockI] = paletteI;

                        blockI += 1;
                    }
                    chunkI += 1024;
                }
                blockI += zBlockIInc;
                chunkI -= 32767;
            }
            blockI += yBlockIInc;
        }
    }
    paletteArr.forEach((id, i) => palette[id] = pnbt.int(i));

    const minecraftJson = pnbt.comp({
        BlockData: pnbt.byteArray(blocks),
        BlockEntities: pnbt.list(pnbt.comp([])),
        Width: pnbt.short(bloxdJson.size[0]),
        Height: pnbt.short(bloxdJson.size[1]),
        Length: pnbt.short(bloxdJson.size[2]),
        Palette: pnbt.comp(palette),
        PaletteMax: pnbt.int(Object.keys(paletteArr).length),
        Version: pnbt.int(2),
        //Java 1.20
        DataVersion: pnbt.int(3463)
    }, "Schematic");

    return minecraftJson;
};


const m2b = function (mcJson, name = "New Schematic") {
    function idxToPos(idx, size) {
        const x = idx % size[0];
        const y = Math.floor(idx / (size[0] * size[2]));
        const z = (size[2] - 1 - Math.floor(idx / size[0]) % size[2]);

        return [x, y, z];
    }

    const bloxdJson = {
        name: name,
        pos: [0, 0, 0],
        size: [0, 0, 0],
        chunks: []
    };

    //Convert palette
    //in case of litematic
    if(Array.isArray(mcJson.palette)) {
        mcJson.palette = mcJson.palette.map(mcToBloxdId);
    } else {
        for(const idx in mcJson.palette) {
            const mcId = mcJson.palette[idx];
            mcJson.palette[idx] = mcToBloxdId(mcId);
        }
    }

    const { size } = mcJson;
    bloxdJson.size = size;
    const chunksSize = size.map(axis => Math.ceil(axis / 32));

    //Set up chunks
    for(let chunkX = 0; chunkX < chunksSize[0]; chunkX++) {
        for(let chunkY = 0; chunkY < chunksSize[1]; chunkY++) {
            for(let chunkZ = 0; chunkZ < chunksSize[2]; chunkZ++) {
                bloxdJson.chunks.push({
                    pos: [
                        chunkX,
                        chunkY,
                        chunkZ
                    ],
                    blocks: new Array(32768).fill(0)
                });
            }
        }
    }

    //Convert blocks
    let blockI = 0;
    while(blockI < mcJson.blocks.length) {
        const pos = idxToPos(blockI, size);
        const chunkLocalPos = pos.map(axis => axis % 32);
        const chunkLocalI = posToIdxBloxd(chunkLocalPos, [32, 32, 32]);
        const chunkPos = pos.map(axis => Math.floor(axis / 32));
        const chunkI = posToIdxBloxd(chunkPos, chunksSize);
        const chunk = bloxdJson.chunks[chunkI];

        const maxI = blockI % size[0] + 32 > size[0] ? size[0] % 32 : 32;
        for(let i = 0; i < maxI; i++) {
            chunk.blocks[chunkLocalI + i * 1024] = mcJson.palette[mcJson.blocks[blockI++]];
        }
    }

    console.log(bloxdJson);
    return bloxdJson;
};

module.exports = {
    bloxdJSONtoMc: b2m,
    mcJSONToBloxd: m2b
}