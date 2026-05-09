export async function loadFontRawPath(path: string): Promise<Uint8Array | null> {
    try {
        const data = await fetch(path);
        return new Uint8Array(await data.arrayBuffer());
    } catch (err) {
        console.error(err);
        return null;
    }
}

export async function loadFonts(paths: string[], fallback: string): Promise<Uint8Array[]> {
    const list = [...paths];
    list.push(fallback);

    const promises = [];
    for (let path of list) {
        promises.push(loadFontRawPath(path));
    }
    const result = await Promise.all(promises);
    const toReturn = [] as Uint8Array[];
    for (let font of result) {
        if (font != null) {
            toReturn.push(font);
        }
    }
    return toReturn;
}

export async function loadSubtitleTrack(path: string): Promise<ArrayBuffer | null> {
    const data = await fetch(path);
    if (data.status == 200 && data.headers != null && data.headers.get("content-type") != null && data.headers.get("content-type") === "text/x-ssa") {
        return await data.arrayBuffer();
    } else {
        return null;
    }
}