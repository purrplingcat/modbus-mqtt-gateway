export class QueuedInterval {
    interval: number;
    private _id: NodeJS.Timeout | null;
    private _fn: (...args: any[]) => void | Promise<void>;

    constructor(fn: (...args: any[]) => void | Promise<void>, interval: number) {
        this._fn = fn;
        this._loop = this._loop.bind(this)
        this._id = null;
        this.interval = interval;
    }

    get id(): NodeJS.Timeout | null {
        return this.id;
    }

    private async _loop() {
        await this._fn()
        this._id = setTimeout(this._loop, this.interval)
    }

    isRunning() {
        return !!this._id;
    }

    start() {
        this._id = setTimeout(this._loop, this.interval)
    }

    stop() {
        if (this._id) {
            clearTimeout(this._id)
            this._id = null;
        }
    }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function setQueuedInterval(fn: (...args: any[]) => void | Promise<void>, interval: number) {
    const queuedInterval = new QueuedInterval(fn, interval)
    queuedInterval.start()

    return queuedInterval;
}
