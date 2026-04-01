/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Smile, 
  Meh, 
  Frown, 
  Clock, 
  User as UserIcon, 
  Building2, 
  AlertCircle, 
  CheckCircle2, 
  PlayCircle,
  BarChart3,
  Bell,
  Plus,
  Search,
  Filter,
  Download
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { utils, writeFile } from "xlsx";
import { ServiceRequest, Rating } from "./types";
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  handleFirestoreError,
  OperationType
} from "./firebase";

export default function App() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [view, setView] = useState<"user" | "admin" | "report">("user");
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [lastNotification, setLastNotification] = useState<string | null>(null);

  // Play sound on notification
  useEffect(() => {
    if (showNotification) {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.volume = 0.5;
      audio.play().catch(() => {}); // Catch if browser blocks autoplay
    }
  }, [showNotification]);

  // Firestore listener for admin/reports
  useEffect(() => {
    const q = query(collection(db, "requests"), orderBy("requestTime", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as ServiceRequest);
      
      // Check for new pending requests to show notification
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const newReq = change.doc.data() as ServiceRequest;
          // Only notify if it's a new pending request (not initial load)
          if (newReq.status === "pending" && newReq.requestTime > Date.now() - 5000) {
            setLastNotification(newReq.user);
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 5000);
          }
        }
      });
      
      setRequests(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "requests");
    });

    return () => unsubscribe();
  }, []);

  // Listener for active request (for unauthenticated users to see status updates)
  useEffect(() => {
    if (!activeRequest?.id) return;

    const unsubscribe = onSnapshot(doc(db, "requests", activeRequest.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as ServiceRequest;
        setActiveRequest(data);
      }
    }, (error) => {
      console.error("Error listening to active request:", error);
    });

    return () => unsubscribe();
  }, [activeRequest?.id]);

  const handleNewRequest = async (data: { user: string; department: string; problem: string }) => {
    const id = Math.random().toString(36).substr(2, 6).toUpperCase();
    const newRequest: ServiceRequest = {
      id,
      ...data,
      requestTime: Date.now(),
      status: "pending",
    };
    
    try {
      await setDoc(doc(db, "requests", id), newRequest);
      setActiveRequest(newRequest);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `requests/${id}`);
    }
  };

  const handleStartService = async (id: string) => {
    try {
      await updateDoc(doc(db, "requests", id), { 
        startTime: Date.now(), 
        status: "in-progress" 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const handleEndService = async (id: string) => {
    const endTime = Date.now();
    try {
      await updateDoc(doc(db, "requests", id), { 
        endTime, 
        status: "completed" 
      });
      
      const req = requests.find(r => r.id === id);
      if (req) {
        setActiveRequest({ ...req, endTime, status: "completed" });
        setView("user");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const handleRate = async (id: string, rating: Rating) => {
    try {
      await updateDoc(doc(db, "requests", id), { rating });
      setActiveRequest(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const triggerNotification = (userName: string) => {
    setLastNotification(userName);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 5000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
            <CheckCircle2 className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">Atención Pro</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión de Servicios</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
            <button 
              onClick={() => setView("user")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200",
                view === "user" ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Solicitar
            </button>
            <button 
              onClick={() => setView("admin")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200",
                view === "admin" ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Gestión
            </button>
            <button 
              onClick={() => setView("report")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200",
                view === "report" ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Reportes
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 md:p-10">
        <AnimatePresence mode="wait">
          {view === "user" && (
            <motion.div
              key="user"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex justify-center"
            >
              {activeRequest ? (
                <RatingScreen 
                  request={activeRequest} 
                  onRate={(rating) => handleRate(activeRequest.id, rating)} 
                />
              ) : (
                <RequestForm onSubmit={handleNewRequest} />
              )}
            </motion.div>
          )}

          {view === "admin" && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminDashboard 
                requests={requests} 
                onStart={handleStartService} 
                onEnd={handleEndService} 
                onNotify={triggerNotification}
              />
            </motion.div>
          )}

          {view === "report" && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ReportView requests={requests} onNotify={triggerNotification} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Notification Alert */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="fixed bottom-8 right-8 bg-slate-900 text-white p-5 rounded-[2rem] shadow-2xl flex items-center gap-4 z-50 border border-white/10 ring-1 ring-black/5"
          >
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-500/20">
              <Bell className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div>
              <p className="font-black text-sm tracking-tight">Nueva Solicitud</p>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="text-blue-400 font-bold">{lastNotification}</span> ha solicitado atención.
              </p>
            </div>
            <button 
              onClick={() => setShowNotification(false)}
              className="ml-2 p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              <Plus className="w-4 h-4 rotate-45 text-slate-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RequestForm({ onSubmit }: { onSubmit: (data: { user: string; department: string; problem: string }) => void }) {
  const [formData, setFormData] = useState({ user: "", department: "", problem: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      onSubmit(formData);
      setFormData({ user: "", department: "", problem: "" });
      setIsSubmitting(false);
    }, 600);
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 border border-slate-100 max-w-lg w-full relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-blue-600" />
      
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Solicitar Atención</h2>
        <p className="text-slate-400 mt-2 font-medium">Completa los datos para recibir asistencia técnica.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-3">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
            <UserIcon className="w-3.5 h-3.5 text-blue-500" /> Usuario Solicitante
          </label>
          <input
            required
            type="text"
            value={formData.user}
            onChange={(e) => setFormData({ ...formData, user: e.target.value })}
            className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all font-semibold placeholder:text-slate-300"
            placeholder="Ej. Juan Pérez"
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
            <Building2 className="w-3.5 h-3.5 text-blue-500" /> Departamento
          </label>
          <div className="relative">
            <select
              required
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all font-semibold bg-white appearance-none cursor-pointer"
            >
              <option value="">Selecciona un área</option>
              <option value="Sistemas">Sistemas</option>
              <option value="Recursos Humanos">Recursos Humanos</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Administración">Administración</option>
              <option value="Ventas">Ventas</option>
            </select>
            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <Filter className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500" /> Descripción del Problema
          </label>
          <textarea
            required
            value={formData.problem}
            onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
            className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all font-semibold min-h-[140px] placeholder:text-slate-300 resize-none"
            placeholder="Describe brevemente qué necesitas..."
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-blue-200 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100",
            isSubmitting && "animate-pulse"
          )}
        >
          {isSubmitting ? (
            "Enviando..."
          ) : (
            <>
              <Plus className="w-6 h-6" /> Enviar Solicitud
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function AdminDashboard({ 
  requests, 
  onStart, 
  onEnd,
  onNotify
}: { 
  requests: ServiceRequest[]; 
  onStart: (id: string) => void; 
  onEnd: (id: string) => void;
  onNotify: (user: string) => void;
}) {
  const activeRequests = requests.filter(r => r.status !== "completed");
  
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gestión de Solicitudes</h2>
          <p className="text-slate-400 font-medium mt-1">Administra y da seguimiento a las solicitudes en tiempo real.</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Pendientes</p>
              <p className="text-lg font-black text-slate-900">{requests.filter(r => r.status === "pending").length}</p>
            </div>
          </div>
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">En Curso</p>
              <p className="text-lg font-black text-slate-900">{requests.filter(r => r.status === "in-progress").length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <AnimatePresence mode="popLayout">
          {activeRequests.map((req) => (
            <motion.div
              layout
              key={req.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative overflow-hidden group"
            >
              <div className={cn(
                "absolute left-0 top-0 w-2 h-full",
                req.status === "pending" ? "bg-amber-500" : "bg-blue-500"
              )} />
              
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                    req.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                  )}>
                    {req.status === "pending" ? "Pendiente" : "En Curso"}
                  </span>
                  <span className="text-slate-300 text-xs font-black tracking-widest">ID: {req.id}</span>
                </div>
                
                <div>
                  <h3 className="font-black text-2xl text-slate-900 tracking-tight">{req.user}</h3>
                  <p className="text-blue-600 text-sm font-bold flex items-center gap-2 mt-1">
                    <Building2 className="w-4 h-4" /> {req.department}
                  </p>
                </div>
                
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 relative">
                  <p className="text-slate-600 text-sm font-medium leading-relaxed italic">"{req.problem}"</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 font-bold uppercase tracking-widest">
                  <button 
                    onClick={() => onNotify(req.user)}
                    className="flex items-center gap-2 hover:text-blue-500 transition-colors group/time"
                    title="Re-enviar alerta de seguimiento"
                  >
                    <Clock className="w-4 h-4 text-slate-300 group-hover/time:text-blue-400" /> 
                    Solicitado: {format(req.requestTime, "HH:mm:ss")}
                  </button>
                  {req.startTime && (
                    <span className="flex items-center gap-2 text-blue-500">
                      <PlayCircle className="w-4 h-4" /> Iniciado: {format(req.startTime, "HH:mm:ss")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[200px]">
                {req.status === "pending" ? (
                  <button
                    onClick={() => onStart(req.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-200 hover:translate-y-[-2px] active:translate-y-0"
                  >
                    <PlayCircle className="w-6 h-6" /> Iniciar Servicio
                  </button>
                ) : (
                  <button
                    onClick={() => onEnd(req.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-200 hover:translate-y-[-2px] active:translate-y-0"
                  >
                    <CheckCircle2 className="w-6 h-6" /> Finalizar
                  </button>
                )}
                <button className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all">
                  Detalles
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {activeRequests.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-32 bg-white rounded-[3rem] border-4 border-dashed border-slate-100"
          >
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-slate-200" />
            </div>
            <h3 className="text-xl font-black text-slate-300 tracking-tight uppercase">Todo al día</h3>
            <p className="text-slate-300 font-bold mt-1">No hay solicitudes pendientes de atención.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function RatingScreen({ request, onRate }: { request: ServiceRequest; onRate: (rating: Rating) => void }) {
  const [selected, setSelected] = useState<Rating | null>(null);

  const handleRate = (rating: Rating) => {
    setSelected(rating);
    setTimeout(() => onRate(rating), 800);
  };

  return (
    <div className="bg-white rounded-[3rem] p-12 shadow-2xl shadow-slate-200 border border-slate-100 max-w-xl w-full text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-3 bg-emerald-500" />
      
      <div className="mb-12">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="bg-emerald-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner"
        >
          <CheckCircle2 className="text-emerald-600 w-12 h-12" />
        </motion.div>
        <h2 className="text-4xl font-black text-slate-900 tracking-tight">¡Servicio Finalizado!</h2>
        <p className="text-slate-400 mt-4 text-lg font-medium">
          Hola <span className="text-slate-900 font-black underline decoration-emerald-500 decoration-4 underline-offset-4">{request.user}</span>, <br />
          ¿Cómo calificarías la atención recibida?
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-4">
        {[
          { id: "happy", icon: Smile, label: "Excelente", color: "emerald" },
          { id: "neutral", icon: Meh, label: "Regular", color: "amber" },
          { id: "sad", icon: Frown, label: "Mala", color: "rose" }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => handleRate(item.id as Rating)}
            disabled={selected !== null}
            className={cn(
              "group flex flex-col items-center gap-4 p-6 rounded-[2rem] transition-all duration-300 border-4",
              selected === item.id 
                ? `bg-${item.color}-50 border-${item.color}-500 scale-105 shadow-lg` 
                : selected === null 
                  ? "bg-slate-50 border-transparent hover:bg-white hover:border-slate-200 hover:shadow-xl" 
                  : "opacity-30 grayscale"
            )}
          >
            <item.icon className={cn(
              "w-16 h-16 transition-all duration-300",
              item.id === "happy" && "text-emerald-500",
              item.id === "neutral" && "text-amber-500",
              item.id === "sad" && "text-rose-500",
              selected === item.id && "scale-110"
            )} />
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportView({ 
  requests,
  onNotify
}: { 
  requests: ServiceRequest[];
  onNotify: (user: string) => void;
}) {
  const completed = requests.filter(r => r.status === "completed" && r.rating);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = completed.filter(r => 
    r.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const data = filtered.map(req => ({
      ID: req.id,
      Usuario: req.user,
      Departamento: req.department,
      Problema: req.problem,
      "Fecha Solicitud": format(req.requestTime, "yyyy-MM-dd HH:mm:ss"),
      "Fecha Inicio": req.startTime ? format(req.startTime, "yyyy-MM-dd HH:mm:ss") : "-",
      "Fecha Fin": req.endTime ? format(req.endTime, "yyyy-MM-dd HH:mm:ss") : "-",
      "Espera (min)": req.startTime ? differenceInMinutes(req.startTime, req.requestTime) : 0,
      "Duración (min)": (req.startTime && req.endTime) ? differenceInMinutes(req.endTime, req.startTime) : 0,
      Calificación: req.rating === "happy" ? "Feliz" : req.rating === "neutral" ? "Neutral" : "Triste"
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Reporte");
    writeFile(wb, `Reporte_Atencion_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Reporte de Atención</h2>
          <p className="text-slate-400 font-medium mt-1">Análisis de tiempos y satisfacción del cliente.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por usuario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-5 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-semibold text-sm"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 disabled:shadow-none"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Servicios</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-black text-slate-900">{completed.length}</p>
            <p className="text-xs font-bold text-emerald-500 mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Completados
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Promedio Espera</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-black text-slate-900">
              {completed.length > 0 
                ? Math.round(completed.reduce((acc, r) => acc + differenceInMinutes(r.startTime!, r.requestTime), 0) / completed.length)
                : 0}
            </p>
            <p className="text-xs font-bold text-blue-500 mb-1.5">minutos</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Satisfacción</p>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <Smile className="w-8 h-8 text-emerald-500 bg-white rounded-full p-0.5" />
              <Smile className="w-8 h-8 text-emerald-500 bg-white rounded-full p-0.5" />
            </div>
            <p className="text-4xl font-black text-slate-900">
              {completed.length > 0 
                ? Math.round((completed.filter(r => r.rating === "happy").length / completed.length) * 100)
                : 0}%
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario y Problema</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Área</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Línea de Tiempo</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Espera</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Calificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((req) => {
                const waitTime = differenceInMinutes(req.startTime!, req.requestTime);
                return (
                  <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-7">
                      <div className="font-black text-slate-900 text-lg tracking-tight">{req.user}</div>
                      <div className="text-xs text-slate-400 font-medium mt-1 line-clamp-1 max-w-[200px] italic">"{req.problem}"</div>
                    </td>
                    <td className="px-8 py-7 text-center">
                      <span className="px-4 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                        {req.department}
                      </span>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-4">
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-black text-slate-300 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" /> 
                            <button 
                              onClick={() => onNotify(req.user)}
                              className="hover:text-blue-600 transition-colors"
                              title="Re-enviar alerta de seguimiento"
                            >
                              SOL: {format(req.requestTime, "HH:mm")}
                            </button>
                          </div>
                          <div className="text-[10px] font-black text-blue-500 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" /> INI: {format(req.startTime!, "HH:mm")}
                          </div>
                          <div className="text-[10px] font-black text-emerald-500 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> FIN: {format(req.endTime!, "HH:mm")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-center">
                      <div className={cn(
                        "inline-flex flex-col items-center justify-center w-16 h-16 rounded-2xl font-black",
                        waitTime < 5 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : 
                        waitTime < 15 ? "bg-amber-50 text-amber-600 border border-amber-100" : 
                        "bg-rose-50 text-rose-600 border border-rose-100"
                      )}>
                        <span className="text-lg leading-none">{waitTime}</span>
                        <span className="text-[8px] uppercase tracking-widest mt-1">min</span>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-center">
                      <div className="flex justify-center">
                        {req.rating === "happy" && (
                          <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                            <Smile className="w-8 h-8 text-emerald-500" />
                          </div>
                        )}
                        {req.rating === "neutral" && (
                          <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                            <Meh className="w-8 h-8 text-amber-500" />
                          </div>
                        )}
                        {req.rating === "sad" && (
                          <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100">
                            <Frown className="w-8 h-8 text-rose-500" />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center">
                    <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-slate-300 font-black uppercase tracking-widest text-sm">Sin datos para mostrar</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
