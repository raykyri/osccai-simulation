# Polis Analysis & Simulation

This application implements the core analysis algorithms used by the Polis real-time survey and opinion analysis tool, running as a TypeScript effect pipeline in the browser. It has been tested against existing CC-licensed Polis data and runs on surveys of 100s-1000s of participants, with 100s of comments, in 300ms-1s.

The tool is based on the PCA, k-means clustering, and visualization implemented in the "Collective Constitution Creator" by cip.org.

## Features

- Simulate participants voting on comments
- (new) Load comments and votes from an existing Polis report
- (new) CORS proxy for loading comments and votes
- Visualize opinion clusters using Principal Component Analysis (PCA)
- Adjust simulation parameters in real-time
- Interactive Vote Matrix and PCA Projection
  - (new) Updated to handle pass vs. non-votes
- (new) Identify top comments for the overall group (using z-score)
- (new) Identify top comments for k-means clustering groups
- (new) Visualize top comments, plus full list of comments with stats
- (new) Express server and CORS proxy for loading reports from Polis
- (new) Parse and reconcile CSV exports from existing conversations

## Getting Started

### Prerequisites

- Node.js (v14 or later recommended)
  - To install Node.js, visit the official website: https://nodejs.org/
  - Download and run the installer for your operating system
  - Follow the installation wizard, accepting the default settings
  - After installation, open a terminal/command prompt and type `node -v` to verify the installation

- npm (comes with Node.js)
  - npm is automatically installed with Node.js
  - To verify npm installation, open a terminal/command prompt and type `npm -v`

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/raykyri/osccai-simulation.git
   cd osccai-simulation
   ```

2. Install dependencies:
   ```
   npm install
   ```

### Running the Application

1. Start the development server:
   ```
   npm dev
   ```

2. Open your browser and navigate to `http://localhost:3000`


### Deploying

The proxy for retrieving data from existing reports and browser client
can be deployed as one package:

```
vercel
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).
