export class QueuedInterval {
    id?: NodeJS.Timeout;
    private _fn: (...args: any[]) => void | Promise<void>;
    private _interval: number;

    constructor(fn: (...args: any[]) => void | Promise<void>, interval: number) {
        this._fn = fn;
        this._interval = interval;
        this._loop = this._loop.bind(this)
    }

    private async _loop() {
        await this._fn()
        this.id = setTimeout(this._loop, this._interval)
    }

    start() {
        this.id = setTimeout(this._loop, this._interval)
    }

    stop() {
        if (this.id) {
            clearTimeout(this.id)
        }
    }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function setQueuedInterval(fn: (...args: any[]) => void | Promise<void>, interval: number) {
    const queuedInterval = new QueuedInterval(fn, interval)
    queuedInterval.start()

    return queuedInterval;
}
