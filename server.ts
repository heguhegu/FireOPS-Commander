import express from "express";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import fs from "fs";

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Agent Tools (Simulated MCP) ---
  
  const tools = {
    retrieve_district_hazards: async ({ location }: { location: string }) => {
      console.log(`Searching hazards for: ${location}`);
      try {
        const hazardsRef = collection(db, "hazards");
        const q = query(hazardsRef, where("location", "==", location));
        const querySnapshot = await getDocs(q);
        
        const hazards: string[] = [];
        querySnapshot.forEach((doc) => {
          hazards.push(doc.data().description || "Unknown hazard");
        });

        if (hazards.length === 0) {
          return `No specific hazards recorded for ${location}. Proceed with standard caution.`;
        }

        return `Hazards found for ${location}: ${hazards.join(", ")}`;
      } catch (error) {
        console.error("Firestore error:", error);
        return "Error retrieving hazards. Assume high-risk environment.";
      }
    },
    create_incident_note: async ({ title, protocols }: { title: string; protocols: string }) => {
      console.log(`Creating note: ${title}`);
      return `SUCCESS: Incident note '${title}' saved with protocols: ${protocols.substring(0, 50)}...`;
    },
    create_dispatch_task: async ({ task_description }: { task_description: string }) => {
      console.log(`Creating task: ${task_description}`);
      return `SUCCESS: Dispatch task created: ${task_description}`;
    },
    schedule_investigation: async ({ location }: { location: string }) => {
      const investigationTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      console.log(`Scheduling investigation for ${location} at ${investigationTime}`);
      return `SUCCESS: Investigation scheduled for ${location} at ${investigationTime}`;
    }
  };

  // --- API Endpoint ---

  app.post("/api/v1/dispatch", async (req, res) => {
    const { station_id, report } = req.body;

    if (!station_id || !report) {
      return res.status(400).json({ error: "station_id and report are required" });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{
              text: `
                You are the FireOps Commander AI for the Jakarta Fire Department.
                A dispatcher has submitted the following report from Station ${station_id}:
                
                "${report}"
                
                Your task:
                1. Extract the location of the incident.
                2. Check for district hazards using the 'retrieve_district_hazards' tool.
                3. Based on the report and hazards, generate necessary tasks, notes, and schedule an investigation if needed.
                4. Provide a final structured triage report.
              `
            }]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              incident_location: { type: Type.STRING },
              agent_actions_taken: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["status", "incident_location", "agent_actions_taken"]
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "retrieve_district_hazards",
                  description: "Queries Firestore for known hazards in a specific district/location.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      location: { type: Type.STRING }
                    },
                    required: ["location"]
                  }
                },
                {
                  name: "create_incident_note",
                  description: "Simulates saving a detailed incident note with safety protocols.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      protocols: { type: Type.STRING }
                    },
                    required: ["title", "protocols"]
                  }
                },
                {
                  name: "create_dispatch_task",
                  description: "Simulates adding a task to the dispatcher's to-do list.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      task_description: { type: Type.STRING }
                    },
                    required: ["task_description"]
                  }
                },
                {
                  name: "schedule_investigation",
                  description: "Simulates booking a post-incident investigation for T+24 hours.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      location: { type: Type.STRING }
                    },
                    required: ["location"]
                  }
                }
              ]
            }
          ]
        }
      });

      let currentResponse = response;
      const conversation: any[] = [{
        role: "user",
        parts: [{ text: report }]
      }];

      while (currentResponse.functionCalls) {
        const toolResults = await Promise.all(
          currentResponse.functionCalls.map(async (call) => {
            const tool = (tools as any)[call.name];
            const result = await tool(call.args);
            return {
              functionResponse: {
                name: call.name,
                response: { content: result }
              }
            };
          })
        );

        conversation.push(currentResponse.candidates![0].content);
        conversation.push({
          role: "user",
          parts: toolResults
        });

        currentResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: conversation,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING },
                incident_location: { type: Type.STRING },
                agent_actions_taken: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["status", "incident_location", "agent_actions_taken"]
            },
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "retrieve_district_hazards",
                    description: "Queries Firestore for known hazards in a specific district/location.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        location: { type: Type.STRING }
                      },
                      required: ["location"]
                    }
                  },
                  {
                    name: "create_incident_note",
                    description: "Simulates saving a detailed incident note with safety protocols.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        protocols: { type: Type.STRING }
                      },
                      required: ["title", "protocols"]
                    }
                  },
                  {
                    name: "create_dispatch_task",
                    description: "Simulates adding a task to the dispatcher's to-do list.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        task_description: { type: Type.STRING }
                      },
                      required: ["task_description"]
                    }
                  },
                  {
                    name: "schedule_investigation",
                    description: "Simulates booking a post-incident investigation for T+24 hours.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        location: { type: Type.STRING }
                      },
                      required: ["location"]
                    }
                  }
                ]
              }
            ]
          }
        });
      }

      const triageData = JSON.parse(currentResponse.text);

      // Save to Firestore
      await addDoc(collection(db, "active_incidents"), {
        station_id,
        original_report: report,
        triage_report: triageData,
        timestamp: serverTimestamp()
      });

      res.json(triageData);

    } catch (error) {
      console.error("Agent Error:", error);
      res.status(500).json({ error: "Internal Server Error", details: (error as any).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
