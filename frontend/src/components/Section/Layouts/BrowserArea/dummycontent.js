const multimediaData = [
  // Images
  {
    id: "img-001",
    type: "image",
    name: "project-wireframe.png",
    source: "local",
    dateCreated: "2025-03-12T14:32:15Z",
    size: 1243500,
    metadata: {
      dimensions: { width: 1920, height: 1080 },
      format: "png",
      colorSpace: "RGB",
    },
    preview: "/assets/previews/project-wireframe-thumb.png",
    tags: ["design", "wireframe", "project-x"],
    description: "Initial wireframe design for the dashboard interface",
  },
  {
    id: "img-002",
    type: "image",
    name: "generated-landscape.jpg",
    source: "llm",
    dateCreated: "2025-04-02T09:15:22Z",
    size: 2567123,
    metadata: {
      dimensions: { width: 2048, height: 1024 },
      format: "jpg",
      colorSpace: "RGB",
      prompt:
        "A serene mountain landscape with a lake at sunset, photorealistic style",
      model: "StableDiffusion-XL-4",
    },
    preview: "/assets/previews/generated-landscape-thumb.jpg",
    tags: ["generated", "landscape", "ai-art"],
    description: "AI-generated landscape based on prompt",
  },
  {
    id: "img-003",
    type: "image",
    name: "user-avatar.svg",
    source: "local",
    dateCreated: "2025-01-30T11:42:18Z",
    size: 24680,
    metadata: {
      dimensions: { width: 512, height: 512 },
      format: "svg",
      colorSpace: "RGB",
    },
    preview: "/assets/previews/user-avatar-thumb.svg",
    tags: ["avatar", "profile", "vector"],
    description: "Vector profile avatar for user accounts",
  },

  // Videos
  {
    id: "vid-001",
    type: "video",
    name: "product-demo.mp4",
    source: "local",
    dateCreated: "2025-03-25T16:20:45Z",
    size: 145678900,
    metadata: {
      duration: 184.5, // in seconds
      format: "mp4",
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      codec: "H.264",
    },
    preview: "/assets/previews/product-demo-thumb.jpg",
    tags: ["demo", "product", "marketing"],
    description: "Product demonstration video for the new feature set",
  },
  {
    id: "vid-002",
    type: "video",
    name: "ai-animation-sequence.webm",
    source: "llm",
    dateCreated: "2025-04-10T08:33:27Z",
    size: 78452361,
    metadata: {
      duration: 45.2, // in seconds
      format: "webm",
      resolution: { width: 1280, height: 720 },
      fps: 60,
      codec: "VP9",
      prompt:
        "A 3D animation of data visualization transforming into a cityscape",
      model: "VideoGen-RT",
    },
    preview: "/assets/previews/ai-animation-sequence-thumb.jpg",
    tags: ["animation", "generated", "data-viz"],
    description:
      "AI-generated animation sequence based on data transformation concept",
  },

  // Code
  {
    id: "code-001",
    type: "code",
    name: "DataProcessor.js",
    source: "local",
    dateCreated: "2025-02-18T13:45:22Z",
    size: 12450,
    metadata: {
      language: "javascript",
      lineCount: 324,
      functions: 15,
      classes: 2,
    },
    preview: `import { useState, useEffect } from 'react';

class DataProcessor {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }
  
  async processData(rawData) {
    // Implementation details...
  }
}

export default DataProcessor;`,
    tags: ["javascript", "utility", "data-processing"],
    description: "Utility class for processing incoming data streams",
  },
  {
    id: "code-002",
    type: "code",
    name: "optimized-algorithm.py",
    source: "llm",
    dateCreated: "2025-04-05T11:27:33Z",
    size: 8790,
    metadata: {
      language: "python",
      lineCount: 198,
      functions: 12,
      model: "Claude-3-Opus",
      prompt:
        "Optimize this graph traversal algorithm for better time complexity",
    },
    preview: `def optimized_graph_traversal(graph, start_node):
    """
    Optimized graph traversal using a modified BFS approach
    with early termination and caching.
    
    Args:
        graph: A dictionary representing the graph structure
        start_node: The node to start traversal from
        
    Returns:
        A dictionary containing shortest paths to all nodes
    """
    visited = set()
    queue = [(start_node, 0)]
    results = {}
    
    # Implementation details...
    
    return results`,
    tags: ["python", "algorithm", "optimization", "generated"],
    description:
      "LLM-optimized graph traversal algorithm with improved performance",
  },

  // Documents
  {
    id: "doc-001",
    type: "document",
    name: "project-requirements.pdf",
    source: "local",
    dateCreated: "2025-02-05T10:15:00Z",
    size: 2345600,
    metadata: {
      format: "pdf",
      pageCount: 24,
      author: "Product Team",
    },
    preview: "/assets/previews/project-requirements-thumb.jpg",
    tags: ["documentation", "requirements", "project-x"],
    description: "Comprehensive requirements document for Project X",
  },
  {
    id: "doc-002",
    type: "document",
    name: "tech-research-summary.md",
    source: "llm",
    dateCreated: "2025-04-08T14:22:18Z",
    size: 58700,
    metadata: {
      format: "markdown",
      wordCount: 5280,
      model: "Claude-3-Opus",
      prompt:
        "Summarize the latest research in quantum computing with focus on algorithm development",
    },
    preview: `# Recent Advances in Quantum Computing Algorithms

## Executive Summary

This report outlines the most significant advancements in quantum algorithm development from the past six months, with a focus on practical applications for the financial sector...

## Quantum Machine Learning Breakthroughs

Recent developments in quantum neural networks have demonstrated...`,
    tags: ["research", "quantum-computing", "generated", "technical"],
    description: "AI-generated research summary on quantum computing advances",
  },

  // Audio
  {
    id: "aud-001",
    type: "audio",
    name: "interview-recording.wav",
    source: "local",
    dateCreated: "2025-03-18T15:30:00Z",
    size: 124567800,
    metadata: {
      duration: 2460, // in seconds (41 minutes)
      format: "wav",
      sampleRate: 44100,
      channels: 2,
      bitDepth: 24,
    },
    preview: "/assets/previews/interview-recording-waveform.png",
    tags: ["interview", "research", "raw"],
    description:
      "Unedited interview recording with Dr. Smith about the research findings",
  },
  {
    id: "aud-002",
    type: "audio",
    name: "generated-voiceover.mp3",
    source: "llm",
    dateCreated: "2025-04-12T09:10:05Z",
    size: 4560000,
    metadata: {
      duration: 183, // in seconds
      format: "mp3",
      sampleRate: 48000,
      channels: 1,
      bitRate: 320,
      model: "VoiceGen-Natural",
      prompt:
        "Professional female voice narrating the product introduction with enthusiasm",
    },
    preview: "/assets/previews/generated-voiceover-waveform.png",
    tags: ["voiceover", "generated", "marketing"],
    description: "AI-generated professional voiceover for product introduction",
  },

  // 3D Models
  {
    id: "model-001",
    type: "3d-model",
    name: "product-prototype.glb",
    source: "local",
    dateCreated: "2025-03-10T12:28:35Z",
    size: 15678900,
    metadata: {
      format: "glb",
      polygons: 45600,
      textures: 8,
      materials: 12,
      dimensions: { width: 10.5, height: 22.3, depth: 8.7 },
    },
    preview: "/assets/previews/product-prototype-render.jpg",
    tags: ["3d", "product", "prototype", "design"],
    description: "3D prototype model of the new product design",
  },
  {
    id: "model-002",
    type: "3d-model",
    name: "generated-landscape.obj",
    source: "llm",
    dateCreated: "2025-04-15T10:40:12Z",
    size: 22456700,
    metadata: {
      format: "obj",
      polygons: 125000,
      textures: 6,
      materials: 8,
      dimensions: { width: 500, height: 120, depth: 500 },
      model: "3DGen-Terrain",
      prompt:
        "Mountainous landscape with rivers and forests, suitable for game environment",
    },
    preview: "/assets/previews/generated-landscape-render.jpg",
    tags: ["3d", "landscape", "environment", "generated"],
    description: "AI-generated 3D landscape for virtual environment",
  },

  // Datasets
  {
    id: "data-001",
    type: "dataset",
    name: "quarterly-sales.csv",
    source: "local",
    dateCreated: "2025-03-01T09:00:00Z",
    size: 1245670,
    metadata: {
      format: "csv",
      rows: 15324,
      columns: 12,
      headers: [
        "Date",
        "Region",
        "Product",
        "Sales",
        "Units",
        "Revenue",
        "Cost",
        "Profit",
        "Manager",
        "Campaign",
        "Channel",
        "Customer",
      ],
    },
    preview: `Date,Region,Product,Sales,Units,Revenue
2025-01-01,North,Widget A,12500,125,62500
2025-01-01,South,Widget B,8700,87,52200
2025-01-02,East,Widget A,9300,93,46500
...`,
    tags: ["data", "sales", "quarterly", "financial"],
    description: "Quarterly sales data across all regions and products",
  },
  {
    id: "data-002",
    type: "dataset",
    name: "market-prediction.json",
    source: "llm",
    dateCreated: "2025-04-14T16:18:22Z",
    size: 876500,
    metadata: {
      format: "json",
      records: 5280,
      fields: 8,
      model: "PredictiveAnalytics-5",
      prompt:
        "Generate market predictions for next quarter based on current trends",
    },
    preview: `[
  {
    "sector": "Technology",
    "predicted_growth": 4.2,
    "confidence": 0.85,
    "key_factors": ["semiconductor shortage easing", "cloud services expansion"],
    "risks": ["regulatory challenges", "supply chain disruptions"],
    "timestamp": "2025-05-01T00:00:00Z"
  },
  {
    "sector": "Healthcare",
    "predicted_growth": 3.7,
    "confidence": 0.82,
    "key_factors": ["aging population", "telemedicine adoption"],
    "risks": ["policy changes", "labor shortages"],
    "timestamp": "2025-05-01T00:00:00Z"
  }
]`,
    tags: ["data", "predictions", "market", "generated", "financial"],
    description:
      "AI-generated market predictions based on current economic data",
  },

  // AR/VR Content
  {
    id: "vr-001",
    type: "vr-scene",
    name: "product-showroom.vrscene",
    source: "local",
    dateCreated: "2025-03-20T11:25:18Z",
    size: 235467800,
    metadata: {
      format: "vrscene",
      entities: 124,
      interactiveElements: 18,
      environment: "indoor",
      dimensions: { width: 30, height: 15, depth: 30 },
    },
    preview: "/assets/previews/product-showroom-preview.jpg",
    tags: ["vr", "showroom", "product", "interactive"],
    description:
      "Virtual reality showroom featuring all product lines in an interactive space",
  },
  {
    id: "ar-001",
    type: "ar-experience",
    name: "product-visualizer.arexp",
    source: "llm",
    dateCreated: "2025-04-16T15:12:40Z",
    size: 98760000,
    metadata: {
      format: "arexp",
      trackedObjects: 5,
      interactions: 12,
      model: "ARGen-Interactive",
      prompt:
        "Create an AR experience that allows users to visualize the product in their space and customize colors and features",
    },
    preview: "/assets/previews/product-visualizer-preview.jpg",
    tags: ["ar", "product", "customization", "generated", "interactive"],
    description:
      "AI-generated augmented reality product visualizer with customization options",
  },

  // Presentations
  {
    id: "pres-001",
    type: "presentation",
    name: "quarterly-results.pptx",
    source: "local",
    dateCreated: "2025-03-31T17:30:00Z",
    size: 5670000,
    metadata: {
      format: "pptx",
      slides: 22,
      author: "Finance Team",
    },
    preview: "/assets/previews/quarterly-results-thumb.jpg",
    tags: ["presentation", "financial", "quarterly", "results"],
    description: "Q1 2025 financial results presentation for stakeholders",
  },
  {
    id: "pres-002",
    type: "presentation",
    name: "market-strategy.slides",
    source: "llm",
    dateCreated: "2025-04-17T10:45:22Z",
    size: 3450000,
    metadata: {
      format: "slides",
      slides: 18,
      model: "Claude-Business",
      prompt:
        "Create a presentation on expanding into Asian markets with focus on localization strategy",
    },
    preview: "/assets/previews/market-strategy-thumb.jpg",
    tags: ["presentation", "strategy", "market-expansion", "generated"],
    description: "AI-generated presentation on Asian market expansion strategy",
  },
];

export default multimediaData;
