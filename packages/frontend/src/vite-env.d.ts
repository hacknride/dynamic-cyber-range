/// <reference types="vite/client" />
/// <reference types="@tanstack/router-vite-plugin" />

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}