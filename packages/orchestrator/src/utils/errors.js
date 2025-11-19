/**
 * Constructs a 400 Bad Request response.
 * @param {*} res
 * @param {*} msg 
 * @param {*} extra 
 * @returns 
 */
export function bad(res, msg, extra = {}) {
    return res.status(400).json({ ok: false, error: msg, ...extra });
}