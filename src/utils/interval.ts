export class QueuedInterval {
    id: NodeJS.Timeout | null;
    private _fn: (...args: any[]) => void | Promise<void>;
    private _interval: number;

    constructor(fn: (...args: any[]) => void | Promise<void>, interval: number) {
        this._fn = fn;
        this._interval = interval;
        this._loop = this._loop.bind(this)
        this.id = null;
    }

    get interval(): number {
        return this._interval;
    }

    set interval(value: number) {
        this._interval = value;

        if (this.isRunning()) {
            this.stop();
            this.start();
        }
    }

    private async _loop() {
        await this._fn()
        this.id = setTimeout(this._loop, this._interval)
    }

    isRunning() {
        return !!this.id;
    }

    start() {
        this.id = setTimeout(this._loop, this._interval)
    }

    stop() {
        if (this.id) {
            clearTimeout(this.id)
            this.id = null;
        }
    }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function setQueuedInterval(fn: (...args: any[]) => void | Promise<void>, interval: number) {
    const queuedInterval = new QueuedInterval(fn, interval)
    queuedInterval.start()

    return queuedInterval;
}
