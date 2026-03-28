<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
    import { sql } from "@/api";

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

    type DocOption = {
        id: string;
        title: string;
        hpath: string;
    };

    const dispatch = createEventDispatcher<{ save: CalendarEvent[] }>();

    export let events: CalendarEvent[] = [];

    const SLOT_MINUTES = 30;
    const SLOT_COUNT = 48;
    const ROW_HEIGHT = 28;

    let localEvents: CalendarEvent[] = [...events];
    let mode: "day" | "week" = "week";
    let anchorDate = startOfDay(new Date());

    let selection: {
        dayIndex: number;
        startSlot: number;
        endSlot: number;
    } | null = null;
    let isSelecting = false;

    let draggingEvent: { id: string; durationSlot: number } | null = null;

    let showForm = false;
    let form = {
        title: "",
        note: "",
        color: "#3a86ff",
        docQuery: "",
        docId: "",
        docTitle: "",
        start: "",
        end: "",
    };
    let docOptions: DocOption[] = [];
    let searchTimer: number | null = null;

    $: visibleDays = getVisibleDays(anchorDate, mode);
    $: totalHeight = SLOT_COUNT * ROW_HEIGHT;

    function emitSave() {
        dispatch("save", [...localEvents]);
    }

    function pad(v: number) {
        return String(v).padStart(2, "0");
    }

    function startOfDay(d: Date) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    function startOfWeek(d: Date) {
        const x = startOfDay(d);
        const day = x.getDay();
        const shift = day === 0 ? 6 : day - 1;
        x.setDate(x.getDate() - shift);
        return x;
    }

    function addDays(d: Date, n: number) {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
    }

    function addMinutes(d: Date, n: number) {
        const x = new Date(d);
        x.setMinutes(x.getMinutes() + n);
        return x;
    }

    function toIsoLocal(d: Date) {
        const y = d.getFullYear();
        const m = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const h = pad(d.getHours());
        const mm = pad(d.getMinutes());
        return `${y}-${m}-${day}T${h}:${mm}:00`;
    }

    function formatLabel(d: Date) {
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function getVisibleDays(anchor: Date, currentMode: "day" | "week") {
        if (currentMode === "day") {
            return [startOfDay(anchor)];
        }
        const first = startOfWeek(anchor);
        return Array.from({ length: 7 }).map((_, i) => addDays(first, i));
    }

    function getHourLabels() {
        return Array.from({ length: SLOT_COUNT }).map((_, i) => {
            const minute = i * SLOT_MINUTES;
            const hh = Math.floor(minute / 60);
            const mm = minute % 60;
            return `${pad(hh)}:${pad(mm)}`;
        });
    }

    function dayStartByIndex(dayIndex: number) {
        return startOfDay(visibleDays[dayIndex]);
    }

    function prev() {
        anchorDate = addDays(anchorDate, mode === "day" ? -1 : -7);
    }

    function next() {
        anchorDate = addDays(anchorDate, mode === "day" ? 1 : 7);
    }

    function today() {
        anchorDate = startOfDay(new Date());
    }

    function startSelect(dayIndex: number, slot: number) {
        isSelecting = true;
        selection = { dayIndex, startSlot: slot, endSlot: slot };
    }

    function moveSelect(dayIndex: number, slot: number) {
        if (!isSelecting || !selection) return;
        if (dayIndex !== selection.dayIndex) return;
        selection = { ...selection, endSlot: slot };
    }

    function finalizeSelect() {
        if (!isSelecting || !selection) return;
        isSelecting = false;

        const begin = Math.min(selection.startSlot, selection.endSlot);
        const end = Math.max(selection.startSlot, selection.endSlot) + 1;

        const base = dayStartByIndex(selection.dayIndex);
        form = {
            title: "",
            note: "",
            color: "#3a86ff",
            docQuery: "",
            docId: "",
            docTitle: "",
            start: toIsoLocal(addMinutes(base, begin * SLOT_MINUTES)),
            end: toIsoLocal(addMinutes(base, end * SLOT_MINUTES)),
        };
        docOptions = [];
        showForm = true;
        selection = null;
    }

    function isSlotSelected(dayIndex: number, slot: number) {
        if (!selection || selection.dayIndex !== dayIndex) return false;
        const begin = Math.min(selection.startSlot, selection.endSlot);
        const end = Math.max(selection.startSlot, selection.endSlot);
        return slot >= begin && slot <= end;
    }

    function normalizeColor(color: string) {
        const value = color.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
        return "#3a86ff";
    }

    function createEvent() {
        const startDate = new Date(form.start);
        const endDate = new Date(form.end);
        if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime())
        )
            return;
        if (endDate <= startDate) return;

        const event: CalendarEvent = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: form.title.trim() || "未命名日程",
            note: form.note.trim(),
            color: normalizeColor(form.color),
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            done: false,
            docId: form.docId || undefined,
            docTitle: form.docTitle || undefined,
        };

        localEvents = [...localEvents, event];
        emitSave();
        showForm = false;
    }

    function eventsForDay(day: Date) {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        return localEvents.filter((event) => {
            const start = new Date(event.start);
            const end = new Date(event.end);
            return start < dayEnd && end > dayStart;
        });
    }

    function getEventStyle(event: CalendarEvent, day: Date) {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        const start = new Date(event.start);
        const end = new Date(event.end);

        const visibleStart = start < dayStart ? dayStart : start;
        const visibleEnd = end > dayEnd ? dayEnd : end;

        const startMinute =
            visibleStart.getHours() * 60 + visibleStart.getMinutes();
        const endMinute = visibleEnd.getHours() * 60 + visibleEnd.getMinutes();

        const top = (startMinute / SLOT_MINUTES) * ROW_HEIGHT;
        const height = Math.max(
            ((endMinute - startMinute) / SLOT_MINUTES) * ROW_HEIGHT,
            ROW_HEIGHT,
        );

        return `top:${top}px;height:${height}px;background:${event.color};`;
    }

    function toggleDone(eventId: string) {
        localEvents = localEvents.map((event) => {
            if (event.id !== eventId) return event;
            return { ...event, done: !event.done };
        });
        emitSave();
    }

    function dragStart(event: CalendarEvent) {
        const start = new Date(event.start);
        const end = new Date(event.end);
        const duration = Math.max(
            (end.getTime() - start.getTime()) / 60000,
            SLOT_MINUTES,
        );
        draggingEvent = {
            id: event.id,
            durationSlot: Math.max(1, Math.round(duration / SLOT_MINUTES)),
        };
    }

    function dropTo(dayIndex: number, slot: number) {
        if (!draggingEvent) return;
        const dayStart = dayStartByIndex(dayIndex);
        const nextStart = addMinutes(dayStart, slot * SLOT_MINUTES);
        const nextEnd = addMinutes(
            nextStart,
            draggingEvent.durationSlot * SLOT_MINUTES,
        );

        localEvents = localEvents.map((event) => {
            if (event.id !== draggingEvent!.id) return event;
            return {
                ...event,
                start: nextStart.toISOString(),
                end: nextEnd.toISOString(),
            };
        });

        draggingEvent = null;
        emitSave();
    }

    function dragEnd() {
        draggingEvent = null;
    }

    async function searchDocsByName(keyword: string) {
        const k = keyword.trim();
        if (!k) {
            docOptions = [];
            return;
        }

        const safe = k.replace(/'/g, "''");
        const query = `
            select id, content, hpath
            from blocks
            where type = 'd' and content like '%${safe}%'
            order by updated desc
            limit 8
        `;

        try {
            const rows = await sql(query);
            docOptions = (rows || []).map((row) => ({
                id: row.id,
                title: row.content || "未命名文档",
                hpath: row.hpath || "",
            }));
        } catch {
            docOptions = [];
        }
    }

    function onDocQueryInput() {
        if (searchTimer) {
            window.clearTimeout(searchTimer);
        }
        searchTimer = window.setTimeout(() => {
            searchDocsByName(form.docQuery);
        }, 200);
    }

    function chooseDoc(option: DocOption) {
        form = {
            ...form,
            docQuery: option.title,
            docId: option.id,
            docTitle: option.title,
        };
        docOptions = [];
    }

    function getRangeText(event: CalendarEvent) {
        const start = new Date(event.start);
        const end = new Date(event.end);
        return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
    }

    function onMaskKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            showForm = false;
        }
    }

    function onMaskClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            showForm = false;
        }
    }

    const hours = getHourLabels();

    function onWindowMouseUp() {
        finalizeSelect();
    }

    onMount(() => {
        window.addEventListener("mouseup", onWindowMouseUp);
    });

    onDestroy(() => {
        window.removeEventListener("mouseup", onWindowMouseUp);
        if (searchTimer) {
            window.clearTimeout(searchTimer);
        }
    });
</script>

<div class="calendar-wrap">
    <div class="toolbar-row">
        <div class="toolbar-left">
            <button on:click={prev}>上一页</button>
            <button on:click={today}>今天</button>
            <button on:click={next}>下一页</button>
        </div>
        <div class="toolbar-right">
            <button
                class:active={mode === "day"}
                on:click={() => (mode = "day")}>日视图</button
            >
            <button
                class:active={mode === "week"}
                on:click={() => (mode = "week")}>周视图</button
            >
        </div>
    </div>

    <div
        class="header-grid"
        style={`grid-template-columns:80px repeat(${visibleDays.length}, minmax(0, 1fr));`}
    >
        <div class="header-time">时间</div>
        {#each visibleDays as day}
            <div class="header-day">{formatLabel(day)}</div>
        {/each}
    </div>

    <div
        class="body-grid"
        style={`grid-template-columns:80px repeat(${visibleDays.length}, minmax(0, 1fr));`}
    >
        <div class="time-col" style={`height:${totalHeight}px;`}>
            {#each hours as hour, idx}
                <div class="time-slot" style={`height:${ROW_HEIGHT}px;`}>
                    {idx % 2 === 0 ? hour : ""}
                </div>
            {/each}
        </div>

        {#each visibleDays as day, dayIndex}
            <div class="day-col" style={`height:${totalHeight}px;`}>
                {#each Array(SLOT_COUNT) as _, slot}
                    <div
                        class={`slot ${isSlotSelected(dayIndex, slot) ? "selected" : ""}`}
                        style={`height:${ROW_HEIGHT}px;`}
                        role="gridcell"
                        tabindex="-1"
                        on:mousedown={() => startSelect(dayIndex, slot)}
                        on:mouseenter={() => moveSelect(dayIndex, slot)}
                        on:dragover|preventDefault
                        on:drop={() => dropTo(dayIndex, slot)}
                    />
                {/each}

                <div class="events-layer">
                    {#each eventsForDay(day) as event}
                        <div
                            class={`event-card ${event.done ? "done" : ""}`}
                            style={getEventStyle(event, day)}
                            role="button"
                            tabindex="0"
                            draggable="true"
                            on:dblclick={() => toggleDone(event.id)}
                            on:keydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    toggleDone(event.id);
                                }
                            }}
                            on:dragstart={() => dragStart(event)}
                            on:dragend={dragEnd}
                            title={event.note || event.title}
                        >
                            <div class="event-title">{event.title}</div>
                            <div class="event-time">{getRangeText(event)}</div>
                            {#if event.docTitle}
                                <div class="event-doc">📄 {event.docTitle}</div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>

{#if showForm}
    <div
        class="modal-mask"
        role="button"
        tabindex="0"
        on:click={onMaskClick}
        on:keydown={onMaskKeydown}
    >
        <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-title">创建日程</div>

            <label>
                <span>日程名称</span>
                <input bind:value={form.title} placeholder="例如：写周报" />
            </label>

            <label>
                <span>备注</span>
                <textarea
                    bind:value={form.note}
                    rows="3"
                    placeholder="可填写说明"
                />
            </label>

            <label>
                <span>颜色（6位hex）</span>
                <input bind:value={form.color} placeholder="#3a86ff" />
            </label>

            <label>
                <span>开始时间</span>
                <input type="datetime-local" bind:value={form.start} />
            </label>

            <label>
                <span>结束时间</span>
                <input type="datetime-local" bind:value={form.end} />
            </label>

            <label>
                <span>从属思源文档</span>
                <input
                    bind:value={form.docQuery}
                    on:input={onDocQueryInput}
                    placeholder="输入文档名搜索"
                />
            </label>

            {#if docOptions.length > 0}
                <div class="doc-options">
                    {#each docOptions as option}
                        <button
                            type="button"
                            class="doc-option"
                            on:click={() => chooseDoc(option)}
                        >
                            <div>{option.title}</div>
                            <div class="doc-path">{option.hpath}</div>
                        </button>
                    {/each}
                </div>
            {/if}

            <div class="modal-actions">
                <button on:click={() => (showForm = false)}>取消</button>
                <button class="primary" on:click={createEvent}>创建</button>
            </div>
        </div>
    </div>
{/if}
