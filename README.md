# FireOps Commander API 🚒

FireOps Commander API is a serverless, multi-agent triage system designed for the Jakarta Fire Department. It leverages Google's Gemini 2.0 Flash model and Firebase Firestore to automate the processing of natural-language distress reports from dispatchers.

## 🌟 Core Features

- **Natural Language Triage**: Process raw distress reports into structured incident data.
- **Multi-Agent Orchestration**: Uses Gemini 2.0 Flash with native function calling (tools) to:
  - Query district-specific hazards from Firestore.
  - Generate incident notes and safety protocols.
  - Create dispatch tasks for responders.
  - Schedule post-incident investigations.
- **Real-Time Dashboard**: A polished React-based command center for dispatchers to monitor and trigger triage flows.
- **Persistent Storage**: All processed incidents and triage reports are saved to Firestore for historical analysis.

## 🛠 Tech Stack

- **Frontend**: React 19, Tailwind CSS, Motion (for animations), Lucide React (icons).
- **Backend**: Node.js with Express (serving as a proxy for Gemini and Firestore).
- **AI**: Google GenAI SDK (`@google/genai`) using `gemini-2.0-flash`.
- **Database**: Firebase Firestore (Native Mode).
- **Deployment**: Dockerized for Google Cloud Run.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- A Google Gemini API Key.
- A Firebase Project with Firestore enabled.

### Local Development

1. **Clone the repository.**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Create a `.env` file (or set in your environment):
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
4. **Firebase Configuration**:
   Ensure `firebase-applet-config.json` is present in the root directory with your project details.
5. **Run the development server**:
   ```bash
   npm run dev
   ```

## ☁️ Deployment

The project is optimized for **Google Cloud Run**.

### Using Docker

1. **Build the image**:
   ```bash
   docker build -t fireops-commander-api .
   ```
2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy fireops-commander-api \
     --source . \
     --region [YOUR_REGION] \
     --allow-unauthenticated \
     --set-env-vars GEMINI_API_KEY="your_api_key_here"
   ```

### Security Note

The `firestore.rules` file contains prototype rules. Ensure you review and harden these rules (especially for the `hazards` and `active_incidents` collections) before moving to a production environment.

## 📄 License

Apache-2.0
