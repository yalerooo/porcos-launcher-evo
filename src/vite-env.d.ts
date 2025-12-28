/// <reference types="vite/client" />

declare module 'rehype-raw' {
    import { Plugin } from 'unified';
    const rehypeRaw: Plugin;
    export default rehypeRaw;
}
