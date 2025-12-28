# Porcos Launcher Evo

Un lanzador personalizado para Minecraft construido con Tauri, React y TypeScript.

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado lo siguiente en tu sistema:

*   **Node.js** (versión LTS recomendada): [Descargar Node.js](https://nodejs.org/)
*   **Rust**: [Instalar Rust](https://www.rust-lang.org/tools/install)
*   **Dependencias de Tauri**: Sigue la guía oficial para tu sistema operativo: [Prerrequisitos de Tauri](https://tauri.app/v1/guides/getting-started/prerequisites)
    *   En Windows, esto incluye las "C++ Build Tools" de Visual Studio y WebView2.

## Instalación y Ejecución

Sigue estos pasos para clonar y ejecutar el proyecto localmente:

1.  **Clonar el repositorio**

    Abre tu terminal y ejecuta:

    ```bash
    git clone https://github.com/yalerooo/porcos-launcher-evo.git
    cd porcos-launcher-evo
    ```

2.  **Instalar dependencias**

    Instala las dependencias del frontend (React/Vite):

    ```bash
    npm install
    ```

3.  **Ejecutar en modo desarrollo**

    Este comando iniciará tanto el servidor de desarrollo de Vite como la ventana de la aplicación Tauri:

    ```bash
    npm run tauri dev
    ```

    La primera vez que ejecutes este comando, puede tardar un poco mientras compila las dependencias de Rust.

## Construcción (Build)

Para generar el ejecutable final para tu sistema operativo:

```bash
npm run tauri build
```

El ejecutable se generará en `src-tauri/target/release/`.

## Tecnologías

*   [Tauri](https://tauri.app/) - Framework para aplicaciones de escritorio
*   [React](https://reactjs.org/) - Librería de UI
*   [TypeScript](https://www.typescriptlang.org/) - Lenguaje
*   [Vite](https://vitejs.dev/) - Build tool
*   [Tailwind CSS](https://tailwindcss.com/) - Estilos

