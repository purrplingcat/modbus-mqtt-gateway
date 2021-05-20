export function toBytes(num: number, count: number): number[] {
    const bytes = Array(count)

    for (let i = count; i > 0; i--) {
        bytes[i-1] = num & (255)
        num = num>>8
    }
    
    return bytes;
}
