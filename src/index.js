const { Buffer } = require("buffer");
const { parseBloxdschem, writeBloxdschem } = require("./bloxd.js");
const { parseSchem, parseLitematic, parseSchematic, writeMinecraft } = require("./minecraft.js");
const { mcJSONToBloxd, bloxdJSONtoMc } = require("./json.js");

const downloadBin = function (data, name) {
    const blob = new Blob([data], {
        type: "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const input = document.createElement("input");
input.type = "file";
input.accept = ".bloxdschem,.schematic,.schem,.litematic";
input.addEventListener("input", () => {
    const file = input.files[0];
    const split = file.name.split(".");
    const name = split[0];
    const type = split[split.length - 1];

    const fileReader = new FileReader();

    let handler;
    if(type === "bloxdschem") {
        handler = bloxdToMinecraft;
    } else if(
        [
            "schem",
            "litematic",
            "schematic"
        ].some(mcType => type === mcType)
    ) {
        handler = mcToBloxd;
    }

    fileReader.readAsArrayBuffer(file);
    fileReader.addEventListener("load", event => {
        const data = Buffer.from(event.target.result);
        handler(data, name, type);
    });
});
document.body.appendChild(input);

const bloxdToMinecraft = function (buffer, name) {
    const startTime = Date.now();

    const parsed = parseBloxdschem(buffer);
    const mcJson = bloxdJSONtoMc(parsed);
    const mcSchem = writeMinecraft(mcJson);
    console.log(`Conversion time: ${Date.now() - startTime}`);

    downloadBin(mcSchem, `${name}.schem`);
};

const mcToBloxd = async function (buffer, name, type) {
    const startTime = Date.now();
    const mcParsers = {
        schem: parseSchem,
        litematic: parseLitematic,
        schematic: parseSchematic
    };

    const parsed = await mcParsers[type](buffer);
    const bloxdJson = mcJSONToBloxd(parsed, name);
    const {
        schems: bloxdSchems,
        sliceSize
    } = writeBloxdschem(bloxdJson);
    console.log(`Conversion time: ${Date.now() - startTime}`);

    for(let i = 0; i < bloxdSchems.length; i++) {
        const bloxdSchem = bloxdSchems[i];
        const nameSuffix = bloxdSchems.length > 1 ? `-x${i * sliceSize}` : "";
        downloadBin(bloxdSchem, `${name + nameSuffix}.bloxdschem`);
    }
};