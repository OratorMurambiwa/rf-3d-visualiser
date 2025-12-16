# RF 3D Visualiser

## What is this?

An interactive 3D visualization tool for radiofrequency power distribution analysis. The application renders RF power data as an interactive 3D surface, allowing users to inspect spatial patterns through rotation, zoom, and color-mapped representation.

## Installation

1. Clone the repository
2. Navigate to the `web` directory
3. Install dependencies: `npm install`
4. Start the development server: `npm run dev`
5. Open your browser and navigate to the local server URL

## Project Structure

- **web/** - Main application directory
  - **src/** - TypeScript source code for 3D surface rendering and color mapping
  - **public/** - Static assets and preprocessed data files
  - **scripts/** - Data preparation utilities (Python)

- **data_raw/** - Raw source data and images for dataset preparation 

## Requirements

- Node.js (v16 or higher)
- npm or yarn
- Python 3.x (for data processing scripts)

## Build

To build for production:

```bash
npm run build
```

This generates optimized bundles ready for deployment.

## Technology Stack

- **Vite** - Build tool and development server
- **TypeScript** - Type-safe JavaScript development
- **WebGL** - 3D graphics rendering
- **Three.js** - 3D visualization library
