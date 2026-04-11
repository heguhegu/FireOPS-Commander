/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Flame, MapPin, ClipboardList, Calendar, Send, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp, doc, getDocFromServer } from "firebase/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface TriageReport {
  status: string;
  incident_location: string;
  agent_actions_taken: string[];
}

export default function App() {
  const [stationId, setStationId] = useState('ST-JKT-01');
  const [report, setReport] = useState('Large fire reported at a warehouse in Pluit, North Jakarta. Multiple explosions heard. Nearby residential area at risk.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    setError(`Firestore Error (${operationType} on ${path}): ${errInfo.error}`);
  };

  // --- Agent Tools (Simulated MCP) ---
  
  const tools = {
    retrieve_district_hazards: async ({ location }: { location: string }) => {
      console.log(`Searching hazards for: ${location}`);
      const path = "hazards";
      try {
        const hazardsRef = collection(db, path);
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
        handleFirestoreError(error, OperationType.GET, path);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v1/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          station_id: stationId,
          report: report,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to process dispatch');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error("Dispatch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 p-2 rounded-lg shadow-lg shadow-orange-900/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">FireOps Commander</h1>
              <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">Jakarta Fire Dept • Multi-Agent Triage</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-slate-300">System Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Input Section */}
          <section>
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-2">Dispatch Entry</h2>
              <p className="text-slate-400">Submit a natural language report to trigger the multi-agent triage system.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Station ID</label>
                <input
                  type="text"
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all text-slate-200"
                  placeholder="e.g. ST-JKT-01"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Incident Report</label>
                <textarea
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all text-slate-200 resize-none"
                  placeholder="Describe the emergency situation..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-4 rounded-xl shadow-lg shadow-orange-900/20 transition-all flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    Deploy Commander Agent
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Output Section */}
          <section className="relative">
            <AnimatePresence mode="wait">
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-sm z-20 rounded-2xl border border-slate-800 border-dashed"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-20 animate-pulse"></div>
                    <Loader2 className="w-12 h-12 text-orange-500 animate-spin relative" />
                  </div>
                  <p className="mt-4 text-slate-300 font-medium">Agent analyzing report...</p>
                  <p className="text-xs text-slate-500 mt-1">Executing tools & querying hazards</p>
                </motion.div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-4"
                >
                  <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-500">System Error</h3>
                    <p className="text-sm text-red-400/80 mt-1">{error}</p>
                  </div>
                </motion.div>
              )}

              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="bg-orange-600/10 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-orange-500" />
                        <span className="font-bold text-white uppercase tracking-wider text-sm">Triage Report Generated</span>
                      </div>
                      <span className="text-[10px] font-mono text-orange-500 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">
                        GEMINI-2.0-FLASH
                      </span>
                    </div>

                    <div className="p-6 space-y-8">
                      {/* Status & Location */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Status</p>
                          <p className="text-lg font-semibold text-white flex items-center gap-2">
                            <Flame className="w-5 h-5 text-orange-500" />
                            {result.status}
                          </p>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Location</p>
                          <p className="text-lg font-semibold text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-500" />
                            {result.incident_location}
                          </p>
                        </div>
                      </div>

                      {/* Actions Taken */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-5 h-5 text-slate-400" />
                          <h3 className="font-semibold text-white">Agent Actions Executed</h3>
                        </div>
                        <div className="space-y-3">
                          {result.agent_actions_taken.map((action, i) => (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1 }}
                              key={i}
                              className="flex items-start gap-3 bg-slate-800/30 p-3 rounded-lg border border-slate-700/30"
                            >
                              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></div>
                              <p className="text-sm text-slate-300 leading-relaxed">{action}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Calendar className="w-4 h-4" />
                          <span className="text-xs">Investigation Scheduled: T+24h</span>
                        </div>
                        <button 
                          onClick={() => window.print()}
                          className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
                        >
                          DOWNLOAD PDF
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {!loading && !result && !error && (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border border-slate-800 border-dashed rounded-2xl bg-slate-900/20">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <Shield className="w-8 h-8 text-slate-600" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-300">Awaiting Dispatch</h3>
                  <p className="text-sm text-slate-500 max-w-xs mt-2">
                    Enter an incident report on the left to begin the automated triage process.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>
    </div>
  );
}
