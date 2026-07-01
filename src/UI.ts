import { GenericObject } from "./types";
import { Converter } from ".";

type ElementOptions = Partial<{
    className: string;
    id: string;
    text?: string;
    attributes?: GenericObject;
    children?: {
        type?: string,
        opts: ElementOptions
    }[];
    events?: {
        type: string;
        listener: (ev: any) => any;
        thisContext?: any
    }[];
}>;

export class UIHandler {
    //silly helper function ive used in a bunch of projects
    private create(type: string, opts: ElementOptions = {}): HTMLElement {
        const elem = document.createElement(type);
        const {
            className,
            id,
            text = "",
            attributes = {},
            children = [],
            events = []
        } = opts;

        if(className) {
            elem.className = className;
        }
        if(id) {
            elem.id = id;
        }

        elem.innerHTML = text;
        for(const property in attributes) {
            elem.setAttribute(property, attributes[property]);
        }
        for(const child of children) {
            elem.appendChild(this.create(child.type ?? "div", child.opts));
        }
        for(const event of events) {
            elem.addEventListener(event.type, event.listener.bind(event.thisContext ?? this));
        }

        return elem;
    }
    private container: Element;
    private converter: Converter;

    constructor(converter: Converter) {
        this.converter = converter;

        const container = document.querySelector(".container");
        if(!container) throw new Error("Container element doesn't exist.");
        this.container = container;

        this.init();
    }

    init() {
        const description = <HTMLDivElement>this.create("div", {
            className: "description",
            text: "Convert schematic files from minecraft to bloxd.io or the other way around.<br>Upload and a schematic to get started:"
        });
        const fileInput = <HTMLInputElement>this.create("input", {
            className: "file-input",
            attributes: {
                type: "file",
                accept: this.converter.legalFileTypes.map(t => `.${t}`).join(",")
            },
            events: [{
                type: "input",
                listener: async () => {
                    const file = fileInput.files?.[0];
                    if(!file) return;

                    await this.converter.handleFile(file).catch(e => { this.error(e.message); throw ""; });

                    this.addExportUI();
                }
            }]
        });
        const uploadButton = this.create("button", {
            className: "upload-button fancy-button shine-button",
            text: "Upload schematic",
            events: [{
                type: "click",
                listener: () => {
                    fileInput.click();
                }
            }]
        });
        const info = this.create("div", {
            className: "upload-info",
            text: `Accepted files: ${this.converter.legalFileTypes.map(t => `.${t}`).join(", ")}<br>All files are processed locally.`
        })

        this.container.append(description, fileInput, uploadButton, info);
    }

    addExportUI() {
        document.querySelector(".export-opts")?.remove();

        const children: ElementOptions[] = [];
        let i = 0;
        for(const type of this.converter.exportFileTypes) {
            if(type === this.converter.currSchemType) continue;

            children.push({
                className: "export-button fancy-button",
                text: `Export as .${type}`,
                attributes: {
                    style: `--i: ${i++}`
                },
                events: [{
                    type: "click",
                    listener: async () => {
                        await this.converter.exportAs(type);
                    }
                }]
            });
        }

        const exportOpts = this.create("div", {
            className: "export-opts",
            children: children.map(opts => ({ type: "button", opts }))
        });

        this.container.appendChild(exportOpts);
    }

    private getPopupElement(inner: Element, addToDOM = true) {
        const messageElem = this.create("div", { className: "popup-message" });
        const element = this.create("div", {
            className: "popup-container"
        });

        messageElem.appendChild(inner);
        element.appendChild(messageElem);
        if(addToDOM) {
            this.container.appendChild(element);
        }

        return element;
    }

    error(text: string) {
        const err = new Error(text);
        const inner = this.create("div", {
            className: "popup-message-inner",
            children: [
                {
                    opts: {
                        className: "popup-header error-header",
                        text: "🚨😱 ERROR 😱🚨"
                    }
                },
                {
                    opts: {
                        className: "popup-text",
                        text
                    }
                },
                {
                    type: "button",
                    opts: {
                        className: "popup-button fancy-button",
                        text: "OK",
                        events: [{
                            type: "click",
                            listener: () => {
                                popup.remove();
                            }
                        }]
                    }
                }
            ]
        });

        const popup = this.getPopupElement(inner, false);
        popup.classList.add("error-container");
        this.container.appendChild(popup);

        //try to remove progress bar, in case code threw during processing
        this.converter.progressBar.finishTask();
        throw err;
    }

    getProgressPopup(taskName: string, subtaskName: string) {
        const inner = this.create("div", {
            className: "popup-message-inner",
            children: [
                {
                    opts: {
                        className: "popup-header",
                        text: taskName
                    }
                },
                {
                    opts: {
                        className: "popup-text",
                        text: subtaskName
                    }
                },
                {
                    opts: { className: "progress-percent popup-text", text: "0%" }
                },
                {
                    opts: {
                        className: "progress-bar",
                        children: [
                            {
                                opts: { className: "progress-bar-inner" }
                            }
                        ]
                    }
                }
            ]
        });

        const popup = this.getPopupElement(inner);
        return popup;
    }

    prompt(title: string, message: string, onSubmit: (value: string, repeat: boolean, save: boolean) => boolean) {
        const makeCheckbox = (id: string, text: string) => {
            return {
                opts: {
                    className: "checkbox-container",
                    id: id,
                    children: [
                        {
                            type: "input",
                            opts: {
                                attributes: {
                                    type: "checkbox"
                                }
                            }
                        },
                        { opts: { text } }
                    ]
                }
            };
        };

        const inner = this.create("div", {
            className: "popup-message-inner",
            children: [
                {
                    opts: {
                        className: "popup-header",
                        text: title
                    }
                },
                {
                    opts: {
                        className: "popup-text",
                        text: message
                    }
                },
                {
                    type: "input",
                    opts: {
                        className: "prompt-input"
                    }
                },
                {
                    opts: {
                        className: "checkboxes-cont",
                        children: [
                            makeCheckbox("all-blocks", "Use this for all blocks"),
                            makeCheckbox("save", "Store this conversion")
                        ]
                    }
                },
                {
                    opts: {
                        className: "error-message"
                    }
                },
                {
                    type: "button",
                    opts: {
                        className: "popup-button fancy-button",
                        text: "OK",
                        events: [{
                            type: "click",
                            listener: () => {
                                // @ts-ignore
                                const repeat = inner.querySelector("#all-blocks>input")?.checked;
                                // @ts-ignore
                                const save = inner.querySelector("#save>input")?.checked;
                                const success = onSubmit(inner.querySelector("input")?.value ?? "", repeat, save);
                                if(success) popup.remove();
                                else {
                                    const elem = inner.querySelector(".error-message")!;
                                    elem.classList.add("active");
                                    elem.innerHTML = "Invalid value";
                                }
                            }
                        }]
                    }
                }
            ]
        });

        const popup = this.getPopupElement(inner);
        return popup;
    }
}