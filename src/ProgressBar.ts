import type { UIHandler } from "./UI";

type SubTask = {
    name: string;
    text: string;
    fromPercent: number;
    percentage: number;
};
type TaskConfig = {
    name: string;
    text: string;
    subTasks: Record<string, SubTask>;
};

type PartialTask = {
    name: string,
    text?: string,
    subTasks: {
        name: string,
        text?: string,
        percentage: number
    }[]
}

export class ProgressBarManager {
    private tasks: Record<string, TaskConfig> = {};
    private UI: UIHandler;
    private currTask: string;
    private currElements: Record<"root" | "subtaskTitle" | "percentage" | "progressBar", HTMLElement> | null = null;

    constructor(UI: UIHandler) {
        this.UI = UI;
    }

    registerTask(partial: PartialTask) {
        const { name, text, subTasks } = partial;

        const config: TaskConfig = {
            name: name,
            text: text ?? name,
            subTasks: {}
        };

        let currentPercent = 0;
        for(let i = 0; i < subTasks.length; i++) {
            const subTask = subTasks[i];

            config.subTasks[subTask.name] = {
                name: subTask.name,
                text: subTask.text ?? subTask.name,
                fromPercent: currentPercent,
                percentage: subTask.percentage
            };

            currentPercent += subTask.percentage;
        }
        if(currentPercent !== 1) throw new Error("Subtask percentages must add up to 1.");

        this.tasks[name] = config;
        return config;
    }

    getPopupElement(taskConfig: TaskConfig) {
        const firstSubtask = Object.values(taskConfig.subTasks)[0];
        const elem = this.UI.getProgressPopup(taskConfig.text, firstSubtask.text);
        this.currElements = {
            root: elem,
            subtaskTitle: elem.querySelector(".popup-text")!,
            percentage: elem.querySelector(".progress-percent")!,
            progressBar: elem.querySelector(".progress-bar")!
        };
    }
    startTask(name: string) {
        if(!(name in this.tasks)) throw new Error(`Task ${name} hasn't been registered.`);

        this.getPopupElement(this.tasks[name]);
        this.currTask = name;
    }
    progress(name: string, amount: number) {
        const taskConfig = this.tasks[this.currTask];
        if(!taskConfig || !this.currElements) throw new Error("Tried to progress without current task");
        const subtask = taskConfig.subTasks[name];
        if(!subtask) throw new Error(`Tried to progress invalid subtask ${name}`);

        //update ui
        const percentage = subtask.fromPercent + subtask.percentage * amount;

        this.currElements.subtaskTitle.innerHTML = subtask.text;
        this.currElements.percentage.innerHTML = `${(percentage * 100).toFixed(1)}%`;
        this.currElements.progressBar.style.setProperty("--progress-percent", `${percentage * 100}%`);
    }
    finishTask() {
        this.currElements?.root?.remove();
        this.currElements = null;
    }
}