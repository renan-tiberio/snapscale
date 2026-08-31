/**
 * Single place the API origin is read from the environment
 * (`VITE_API_URL`, default `http://localhost:4000`). Imported by the axios
 * instance and by the file-URL builders so both always agree.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
