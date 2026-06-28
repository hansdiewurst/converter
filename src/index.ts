import Schematic from "./converter";
import BloxdschemHandler, { BloxdschemData, Chunk } from "./schematic-handlers/bloxdschem";
import SpongeHandler from "./schematic-handlers/schem";
import SchematicHandler from "./schematic-handlers/schematic";
import LitematicHandler from "./schematic-handlers/litematic";
import { UIHandler } from "./UI";
import { ProgressBarManager } from "./ProgressBar";
import BlockConverter from "./block-converter";
import ndarray from "ndarray";
import JSZip from "jszip";

const legalFileTypes = [ "bloxdschem", "schem", "schematic", "litematic" ] as const;
const exportFileTypes = [ "bloxdschem", "schem" ] as const;
export type LegalFileType = (typeof legalFileTypes)[number];
export type ExportFileType = (typeof exportFileTypes)[number];

class Reader {
    private fileReader: FileReader;
    private callbacks = {
        resolve: (value: Buffer) => {},
        reject: () => {}
    };

    constructor() {
        const reader = new FileReader();

        reader.onload = () => {
            const result = reader.result as ArrayBuffer;
            if(result === null) this.callbacks.reject();
            const data = Buffer.from(result);
            this.callbacks.resolve(data);
        };
        reader.onerror = () => {
            this.callbacks.reject();
        }

        this.fileReader = reader;
    }

    read(file: File): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if(this.fileReader.readyState === 1) {
                console.warn("Shared file reader wasn't ready yet. This shouldn't really happen");
                reject();
            }

            this.callbacks = {
                resolve,
                reject
            };
            this.fileReader.readAsArrayBuffer(file);
        });
    }
}

export class Converter {
    private schematicHandlers = {
        "bloxdschem": new BloxdschemHandler(),
        "schem": new SpongeHandler(),
        "schematic": new SchematicHandler(),
        "litematic": new LitematicHandler()
    } satisfies Record<LegalFileType, unknown>;

    private currSchematic: Schematic | null = null;
    currSchemName: string;
    currSchemType: string;

    private reader: Reader;
    private UI: UIHandler;
    progressBar: ProgressBarManager;

    legalFileTypes = legalFileTypes;
    exportFileTypes = exportFileTypes;

    constructor() {
        this.reader = new Reader();
        this.UI = new UIHandler(this);
        this.progressBar = new ProgressBarManager(this.UI);
        this.progressBar.registerTask({
            name: "load_schematic",
            text: "Loading Schematic",
            subTasks: [
                //subtask percentages are just guesses (and not very accurate ones at that)
                {
                    name: "read_file",
                    text: "Reading File",
                    percentage: 0.2
                },
                {
                    name: "parse_schematic",
                    text: "Parsing Schematic",
                    percentage: 0.4
                },
                {
                    name: "to_shared",
                    text: "Writing to shared format",
                    percentage: 0.4
                }
            ]
        });
        this.progressBar.registerTask({
            name: "export_schematic",
            text: "Exporting Schematic",
            subTasks: [
                //subtask percentages are just guesses (and not very accurate ones at that)
                {
                    name: "converting",
                    text: "Converting schematic",
                    percentage: 0.5
                },
                {
                    name: "writing",
                    text: "Writing file data",
                    percentage: 0.4
                },
                {
                    name: "downloading",
                    text: "Downloading file",
                    percentage: 0.1
                }
            ]
        });

        //Not the nicest solution, only works for treating Converter as singleton
        Schematic.blockConverter = new BlockConverter(this.UI);
    }

    async handleFile(file: File) {
        this.progressBar.startTask("load_schematic");
        this.currSchematic = null;

        const split = file.name.split(".");
        const name = split[0];
        const fileType = split.at(-1) as LegalFileType;
        if(!legalFileTypes.includes(fileType)) throw new Error("Invalid file type");

        this.currSchemName = name;
        this.currSchemType = fileType;

        this.progressBar.progress("read_file", 0);
        const buffer = await this.reader.read(file).catch(() => { throw new Error("Failed to read file"); });
        this.progressBar.progress("read_file", 1);

        this.progressBar.progress("parse_schematic", 0);
        const data = await this.schematicHandlers[fileType].parseBuffer(buffer).catch(e => { throw e; });
        this.progressBar.progress("parse_schematic", 1);

        this.progressBar.progress("to_shared", 0);
        const schematic: Schematic = await Schematic.fromType(fileType, data, name);
        this.progressBar.progress("to_shared", 1);

        this.currSchematic = schematic;
        this.progressBar.finishTask();
    }

    private downloadBinary(data: any, name: string) {
        const blob = new Blob([data], {
            type: "application/octet-stream"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    private async downloadZip(zip, name) {
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    private getSubChunks(
        chunkNdarray: ndarray.NdArray<number[][]>,
        [chunkStartX, chunkStartY, chunkStartZ]: [number, number, number],
        [chunkSizeX, chunkSizeY, chunkSizeZ]: [number, number, number]
    ): Chunk[] {
        const chunks: Chunk[] = [];

        for(let chunkX = 0; chunkX < chunkSizeX; chunkX++) {
            for(let chunkY = 0; chunkY < chunkSizeY; chunkY++) {
                for(let chunkZ = 0; chunkZ < chunkSizeZ; chunkZ++) {
                    const chunk = chunkNdarray.get(chunkX + chunkStartX, chunkY + chunkStartY, chunkZ + chunkStartZ);

                    chunks.push({ x: chunkX, y: chunkY, z: chunkZ, blocks: chunk });
                }
            }
        }

        return chunks;
    }
    private splitBloxdschem(data: BloxdschemData): BloxdschemData | BloxdschemData[] {
        const CHUNK_LIMIT = 200;

        const schems: BloxdschemData[] = [];

        //This disregards schematic start, because converted schems cant have a start offset anyway
        const chunkSizeX = Math.ceil(data.width / 32);
        const chunkSizeY = Math.ceil(data.height / 32);
        const chunkSizeZ = Math.ceil(data.length / 32);

        if(chunkSizeX * chunkSizeY * chunkSizeZ < CHUNK_LIMIT) return data;

        //write chunks to ndarray, because data.chunks might not be ordered
        const chunkNdarray = ndarray<number[][]>([], [chunkSizeX, chunkSizeY, chunkSizeZ]);
        for(const chunk of data.chunks) {
            //wrong ndarray types
            // @ts-ignore
            chunkNdarray.set(chunk.x, chunk.y, chunk.z, chunk.blocks);
        }

        const sliceX = Math.min(CHUNK_LIMIT, chunkSizeX);
        const sliceY = Math.min(Math.floor(CHUNK_LIMIT / sliceX), chunkSizeY);
        const sliceZ = Math.min(Math.floor(CHUNK_LIMIT / sliceX / sliceY), chunkSizeZ);

        for(let chunkXStart = 0; chunkXStart < chunkSizeX; chunkXStart += sliceX) {
            for(let chunkYStart = 0; chunkYStart < chunkSizeY; chunkYStart += sliceY) {
                for(let chunkZStart = 0; chunkZStart < chunkSizeZ; chunkZStart += sliceZ) {
                    const chunkSubWidth = Math.min(sliceX, chunkSizeX - chunkXStart);
                    const chunkSubHeight = Math.min(sliceY, chunkSizeY - chunkYStart);
                    const chunkSubLength = Math.min(sliceZ, chunkSizeZ - chunkZStart);

                    const subChunks = this.getSubChunks(
                        chunkNdarray,
                        [chunkXStart, chunkYStart, chunkZStart],
                        [
                            chunkSubWidth,
                            chunkSubHeight,
                            chunkSubLength
                        ]
                    );

                    const subSchematic: BloxdschemData = {
                        name: `${data.name} - Offset ${chunkXStart * 32} ${chunkYStart * 32} ${chunkZStart * 32}`,
                        x: 0,
                        y: 0,
                        z: 0,
                        width: Math.min(chunkSubWidth * 32, data.width - chunkXStart * 32),
                        height: Math.min(chunkSubHeight * 32, data.height - chunkYStart * 32),
                        length: Math.min(chunkSubLength * 32, data.length - chunkZStart * 32),
                        chunks: subChunks
                    };

                    schems.push(subSchematic);
                }
            }
        }

        return schems;
    }

    async exportAs(type: ExportFileType) {
        if(!this.currSchematic) {
            this.UI.error("No schematic loaded");
            throw "";
        }

        this.progressBar.startTask("export_schematic");

        this.progressBar.progress("converting", 0);
        const data = await this.currSchematic.toType(type);
        this.progressBar.progress("converting", 1);
        const handler = this.schematicHandlers[type];

        if(type === "bloxdschem") {
            const split = this.splitBloxdschem(data as BloxdschemData);
            if(Array.isArray(split)) {
                const zip = new JSZip();

                this.progressBar.progress("writing", 0);
                for(const bloxdschem of split) {
                    const binary = handler.writeBuffer(bloxdschem as any);

                    zip.file(`${bloxdschem.name}.bloxdschem`, binary, { binary: true });
                }
                this.progressBar.progress("writing", 1);

                this.progressBar.progress("downloading", 0);
                this.downloadZip(zip, this.currSchemName);
                this.progressBar.progress("downloading", 1);

                this.progressBar.finishTask();
                return;
            }
        }

        this.progressBar.progress("writing", 0);
        const buffer = this.schematicHandlers[type].writeBuffer(data as any);
        this.progressBar.progress("writing", 1);

        this.progressBar.progress("downloading", 0);
        this.downloadBinary(buffer, `${this.currSchemName}.${type}`);
        this.progressBar.progress("downloading", 1);

        this.progressBar.finishTask();
    }
}

globalThis.converter = new Converter();