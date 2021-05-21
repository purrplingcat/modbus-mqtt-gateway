/**
 * This is edited semaphore from https://github.com/DirtyHairy/async-mutex
 * original semaphore/mutex by DirtyHairy
 * MIT license
 * 
 * My edit adds support for priorities in queue
 */

interface ISemaphore {
    acquire(priority: number): Promise<[number, ISemaphore.Releaser]>;

    runExclusive<T>(callback: ISemaphore.Worker<T>, priority: number): Promise<T>;

    isLocked(): boolean;

    cancel(): void;
}

namespace ISemaphore {
    export interface Releaser {
        (): void;
    }

    export interface Worker<T> {
        (value: number): Promise<T> | T;
    }
}

export default ISemaphore;