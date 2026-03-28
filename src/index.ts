import { Dialog, Plugin, getFrontend } from "siyuan";
import "./index.scss";
import CalendarPanel from "@/hello.svelte";

type CalendarEvent = {
    id: string;
    title: string;
    note: string;
    color: string;
    start: string;
    end: string;
    done: boolean;
    docId?: string;
    docTitle?: string;
};

type CalendarStore = {
    events: CalendarEvent[];
};

const DATA_FILE = "calendar-data.json";

export default class SiYuanCalendarPlugin extends Plugin {
    private dialog: Dialog | null = null;
    private events: CalendarEvent[] = [];

    async onload() {
        const data = await this.loadData(DATA_FILE) as CalendarStore | null;
        this.events = Array.isArray(data?.events) ? data!.events : [];

        this.addTopBar({
            icon: "iconCalendar",
            title: "SiYuan Calendar",
            position: "right",
            callback: () => this.openCalendar(),
        });

        this.addCommand({
            langKey: "showDialog",
            hotkey: "⇧⌘Y",
            callback: () => this.openCalendar(),
        });
    }

    onunload() {
        this.dialog?.destroy();
        this.dialog = null;
    }

    private openCalendar() {
        const frontend = getFrontend();
        const isMobile = frontend === "mobile" || frontend === "browser-mobile";

        if (this.dialog) {
            this.dialog.destroy();
            this.dialog = null;
        }

        const container = document.createElement("div");

        this.dialog = new Dialog({
            title: "SiYuan Calendar",
            content: "<div class='siyuan-calendar-root'></div>",
            width: isMobile ? "96vw" : "1120px",
            height: isMobile ? "88vh" : "760px",
            destroyCallback: () => {
                app.$destroy();
                this.dialog = null;
            },
        });

        const root = this.dialog.element.querySelector(".siyuan-calendar-root");
        root?.appendChild(container);

        const app = new CalendarPanel({
            target: container,
            props: {
                events: this.events,
            },
        });

        app.$on("save", async (e: CustomEvent<CalendarEvent[]>) => {
            this.events = e.detail;
            await this.saveData(DATA_FILE, { events: this.events });
        });
    }
}
