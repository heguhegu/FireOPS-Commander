import os
import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import firebase_admin
from firebase_admin import credentials, firestore
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# --- Firebase Initialization ---
# In a real Cloud Run environment, the default credentials are used.
# For local development, you might need a service account key.
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# --- Models ---
class DispatchRequest(BaseModel):
    station_id: str
    report: str

class TriageReport(BaseModel):
    status: str
    incident_location: str
    agent_actions_taken: List[str]

# --- Agent Tools (Simulated MCP) ---

def retrieve_district_hazards(location: str) -> str:
    """Queries Firestore for known hazards in a specific district/location."""
    print(f"Searching hazards for: {location}")
    try:
        # Simple search: looking for documents where location matches
        docs = db.collection("hazards").where("location", "==", location).stream()
        hazards = []
        for doc in docs:
            hazards.append(doc.to_dict().get("description", "Unknown hazard"))
        
        if not hazards:
            return f"No specific hazards recorded for {location}. Proceed with standard caution."
        
        return f"Hazards found for {location}: " + ", ".join(hazards)
    except Exception as e:
        print(f"Firestore error: {e}")
        return "Error retrieving hazards. Assume high-risk environment."

def create_incident_note(title: str, protocols: str) -> str:
    """Simulates saving a detailed incident note with safety protocols."""
    print(f"Creating note: {title}")
    return f"SUCCESS: Incident note '{title}' saved with protocols: {protocols[:50]}..."

def create_dispatch_task(task_description: str) -> str:
    """Simulates adding a task to the dispatcher's to-do list."""
    print(f"Creating task: {task_description}")
    return f"SUCCESS: Dispatch task created: {task_description}"

def schedule_investigation(location: str) -> str:
    """Simulates booking a post-incident investigation for T+24 hours."""
    investigation_time = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    print(f"Scheduling investigation for {location} at {investigation_time}")
    return f"SUCCESS: Investigation scheduled for {location} at {investigation_time}"

# --- Agent Orchestration ---

app = FastAPI(title="FireOps Commander API")

# Initialize Gemini Client
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# Define the tools for the agent
tools = [
    retrieve_district_hazards,
    create_incident_note,
    create_dispatch_task,
    schedule_investigation
]

@app.post("/api/v1/dispatch", response_model=TriageReport)
async def dispatch_incident(request: DispatchRequest):
    """
    Triage endpoint that uses a Gemini agent to process natural language reports,
    execute tools, and generate a structured response.
    """
    
    prompt = f"""
    You are the FireOps Commander AI for the Jakarta Fire Department.
    A dispatcher has submitted the following report from Station {request.station_id}:
    
    "{request.report}"
    
    Your task:
    1. Extract the location of the incident.
    2. Check for district hazards using the 'retrieve_district_hazards' tool.
    3. Based on the report and hazards, generate necessary tasks, notes, and schedule an investigation if needed.
    4. Provide a final structured triage report.
    
    Use the provided tools to perform these actions.
    """

    try:
        # Call Gemini with function calling enabled
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=tools,
                response_mime_type="application/json",
                response_schema=TriageReport
            )
        )

        # The SDK handles the tool calls automatically if configured correctly, 
        # but with the new 'google-genai' SDK, we often use the 'chat' interface for multi-turn tool usage
        # or handle the tool calls manually if generate_content returns them.
        # For simplicity in this prototype, we'll use a chat session which handles automatic tool calling.
        
        chat = client.chats.create(
            model="gemini-2.0-flash",
            config=types.GenerateContentConfig(
                tools=tools,
                response_mime_type="application/json",
                response_schema=TriageReport
            )
        )
        
        response = chat.send_message(prompt)
        
        # Extract structured data
        triage_data = response.parsed
        
        if not triage_data:
            # Fallback if parsing fails
            raise HTTPException(status_code=500, detail="Failed to generate structured triage report")

        # Save to Firestore
        incident_ref = db.collection("active_incidents").document()
        incident_doc = {
            "station_id": request.station_id,
            "original_report": request.report,
            "triage_report": triage_data.model_dump(),
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        incident_ref.set(incident_doc)

        return triage_data

    except Exception as e:
        print(f"Agent Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
