export function dd(x) {
    return Math.round(x * 100) / 100
}

export function entitywhxya(e) {
    const degree = Math.round(180 * e.angle / Math.PI)
    return `${dd(e.template.size[0])}x${dd(e.template.size[1])}+${dd(e.position[0])}+${dd(e.position[1])}o${degree}`
}
