/**
 * This is edited semaphore from https://github.com/DirtyHairy/async-mutex
 * original semaphore/mutex by DirtyHairy
 * MIT license
 * 
 * My edit adds support for priorities in queue
 */

interface SemaphoreInterface {
    acquire(priority: number): Promise<[number, SemaphoreInterface.Releaser]>;

    runExclusive<T>(callback: SemaphoreInterface.Worker<T>, priority: number): Promise<T>;

    isLocked(): boolean;

    cancel(): void;
}

namespace SemaphoreInterface {
    export interface Releaser {
        (): void;
    }

    export interface Worker<T> {
        (value: number): Promise<T> | T;
    }
}

export default SemaphoreInterface;