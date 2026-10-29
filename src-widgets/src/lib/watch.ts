/*
 * Subscriptions for data points that are not attribute fields of type "id" (VIS-2 subscribes only those):
 * the device list of the floor plan is JSON, so the widgets subscribe its data points themselves.
 */
type StateHandler = (id: string, state: ioBroker.State | null | undefined) => void;

/** The part of the VIS-2 connection the watcher needs */
export interface Socket {
    subscribeState(ids: string[], cb: StateHandler): Promise<void>;
    unsubscribeState(ids: string[], cb: StateHandler): void;
    getStates(ids: string[]): Promise<Record<string, ioBroker.State | null | undefined>>;
}

export interface Snapshot {
    val: ioBroker.StateValue;
    ack: boolean;
    ts: number;
}

export class StateWatcher {
    private ids: string[] = [];
    private values: Record<string, Snapshot | undefined> = {};
    /** increments on every new set of ids, so a late answer for an old set is dropped */
    private generation = 0;

    constructor(
        private readonly socket: Socket,
        private readonly onChange: () => void,
    ) {}

    private onState = (id: string, state: ioBroker.State | null | undefined): void => {
        this.values[id] = state ? { val: state.val, ack: state.ack, ts: state.ts } : undefined;
        this.onChange();
    };

    /** Subscribes exactly these ids (no-op when unchanged) */
    async watch(ids: string[]): Promise<void> {
        const next = [...new Set(ids.filter(Boolean))].sort();
        if (next.join('|') === this.ids.join('|')) {
            return;
        }
        const generation = ++this.generation;
        this.stop();
        this.ids = next;
        if (!next.length) {
            this.onChange();
            return;
        }
        await this.socket.subscribeState(next, this.onState);
        const states = await this.socket.getStates(next);
        if (generation !== this.generation) {
            return;
        }
        for (const id of next) {
            const s = states[id];
            this.values[id] = s ? { val: s.val, ack: s.ack, ts: s.ts } : undefined;
        }
        this.onChange();
    }

    stop(): void {
        if (this.ids.length) {
            this.socket.unsubscribeState(this.ids, this.onState);
        }
        this.ids = [];
        this.values = {};
    }

    val = (id: string | undefined): unknown => (id ? this.values[id]?.val : undefined);

    snapshot(id: string): Snapshot | undefined {
        return this.values[id];
    }
}
