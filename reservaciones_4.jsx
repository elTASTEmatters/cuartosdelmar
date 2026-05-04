import { useState, useEffect, useMemo } from "react";

// ─── Persistent Storage ────────────────────────────────────────────────────
const STORAGE_KEY = "rental_monitor_v1";
const SHARED_KEY = "rental_public_v1";

async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
async function savePublic(data) {
  try { await window.storage.set(SHARED_KEY, JSON.stringify(data), true); } catch {}
}

// ─── Initial State ─────────────────────────────────────────────────────────
const ROOMS = [
  { id: "laguna", name: "Cuarto Laguna", icon: "🌿", color: "#2d6a4f" },
  { id: "mar1",   name: "Cuarto del Mar 1", icon: "🌊", color: "#1a6fa8" },
  { id: "mar2",   name: "Cuarto del Mar 2", icon: "🐚", color: "#0f4c75" },
];

const SERVICES = ["Limpieza general", "Cambio de ropa de cama", "Mantenimiento especial"];

const initialState = () => ({
  reservations: [],   // {id, roomId, guestName, phone, checkIn, checkOut, notes, status}
  repairs: [],        // {id, roomId, date, repairDate, techName, techPhone, description}
  history: [],        // {id, roomId, guestName, phone, checkIn, checkOut}
  serviceRequests: [], // {id, roomId, services:[], date, notes, status}
});

// ─── Helpers ───────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" }) : "";
const today = () => new Date().toISOString().slice(0,10);

function isOccupied(reservations, roomId, date) {
  return reservations.some(r =>
    r.roomId === roomId && r.status !== "cancelada" &&
    r.checkIn <= date && r.checkOut >= date
  );
}

// ─── Weather estimator (coastal Mexico heuristic) ──────────────────────────
function getWeather(dateStr) {
  if (!dateStr) return null;
  const m = new Date(dateStr + "T12:00:00").getMonth() + 1; // 1-12
  if ([12,1,2].includes(m)) return { icon:"🌤", label:"Fresco y seco", temp:"22–27°C", risk:"Bajo" };
  if ([3,4,5].includes(m)) return { icon:"☀️", label:"Caluroso y seco", temp:"28–34°C", risk:"Bajo" };
  if ([6,7,8].includes(m)) return { icon:"⛈", label:"Temporada de lluvias", temp:"27–32°C", risk:"Medio-Alto (huracanes)" };
  return { icon:"🌧", label:"Lluvioso / posibles frentes", temp:"24–30°C", risk:"Medio" };
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("dashboard");
  const [calMode, setCalMode] = useState("month");
  const [calDate, setCalDate] = useState(today());
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData().then(d => setData(d || initialState()));
  }, []);

  useEffect(() => {
    if (!data) return;
    saveData(data);
    // sync public view (only reservations + room names)
    savePublic({
      rooms: ROOMS,
      reservations: data.reservations.filter(r => r.status !== "cancelada").map(r => ({
        roomId: r.roomId, checkIn: r.checkIn, checkOut: r.checkOut, status: r.status,
      })),
      updatedAt: new Date().toISOString(),
    });
  }, [data]);

  const showToast = (msg, color="#2d6a4f") => {
    setToast({msg, color});
    setTimeout(() => setToast(null), 2500);
  };

  const update = (fn) => setData(prev => { const next = {...prev}; fn(next); return next; });

  // ── CRUD ──
  const addReservation = (form) => {
    update(d => {
      const res = { id: uid(), ...form, status: "confirmada" };
      d.reservations = [...d.reservations, res];
      d.history = [...d.history, { id: uid(), roomId: form.roomId, guestName: form.guestName, phone: form.phone, checkIn: form.checkIn, checkOut: form.checkOut }];
    });
    showToast("✅ Reservación guardada");
    setModal(null);
  };
  const cancelReservation = (id) => {
    update(d => { d.reservations = d.reservations.map(r => r.id===id ? {...r, status:"cancelada"} : r); });
    showToast("🚫 Reservación cancelada","#c0392b");
  };
  const markOccupied = (id) => {
    update(d => { d.reservations = d.reservations.map(r => r.id===id ? {...r, status:"ocupada"} : r); });
    showToast("🔴 Marcada como ocupada");
  };
  const addService = (form) => {
    update(d => { d.serviceRequests = [...d.serviceRequests, { id: uid(), ...form, date: today(), status: "pendiente" }]; });
    showToast("🔧 Solicitud de servicio creada");
    setModal(null);
  };
  const addRepair = (form) => {
    update(d => { d.repairs = [...d.repairs, { id: uid(), ...form, date: today() }]; });
    showToast("🛠️ Reparación registrada");
    setModal(null);
  };
  const resolveService = (id) => {
    update(d => { d.serviceRequests = d.serviceRequests.map(s => s.id===id ? {...s, status:"resuelto"} : s); });
  };

  if (!data) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"serif",color:"#2d6a4f",fontSize:20}}>Cargando...</div>;

  const pendingServices = data.serviceRequests.filter(s => s.status==="pendiente");

  return (
    <div style={styles.shell}>
      <style>{css}</style>
      {/* Toast */}
      {toast && <div style={{...styles.toast, background: toast.color}}>{toast.msg}</div>}

      {/* Sidebar */}
      <nav style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={{fontSize:28}}>🏠</span>
          <span style={styles.logoText}>GestiRenta</span>
        </div>
        {[
          {id:"dashboard",icon:"📊",label:"Dashboard"},
          {id:"calendar",icon:"📅",label:"Calendario"},
          {id:"history",icon:"📋",label:"Historial"},
          {id:"services",icon:"🔧",label:"Servicios"},
          {id:"public",icon:"🔗",label:"Vista Pública"},
        ].map(v => (
          <button key={v.id} onClick={()=>setView(v.id)}
            style={{...styles.navBtn, background: view===v.id ? "rgba(255,255,255,0.18)" : "transparent",
              borderLeft: view===v.id ? "3px solid #a8d5b5" : "3px solid transparent"}}>
            <span>{v.icon}</span><span>{v.label}</span>
            {v.id==="services" && pendingServices.length>0 && (
              <span style={styles.badge}>{pendingServices.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Main */}
      <main style={styles.main}>
        {view==="dashboard" && <Dashboard data={data} onModal={setModal} onCancel={cancelReservation} onOccupy={markOccupied} filter={filter} setFilter={setFilter} />}
        {view==="calendar" && <CalendarView data={data} mode={calMode} setMode={setCalMode} date={calDate} setDate={setCalDate} onModal={setModal} />}
        {view==="history" && <HistoryView data={data} />}
        {view==="services" && <ServicesView data={data} onModal={setModal} onResolve={resolveService} />}
        {view==="public" && <PublicLink />}
      </main>

      {/* Modals */}
      {modal?.type==="newReservation" && <ReservationModal roomId={modal.roomId} onSave={addReservation} onClose={()=>setModal(null)} data={data} />}
      {modal?.type==="newService" && <ServiceModal onSave={addService} onClose={()=>setModal(null)} />}
      {modal?.type==="newRepair" && <RepairModal onSave={addRepair} onClose={()=>setModal(null)} />}
      {modal?.type==="weather" && <WeatherModal date={modal.date} onClose={()=>setModal(null)} />}
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
function Dashboard({ data, onModal, onCancel, onOccupy, filter, setFilter }) {
  const tod = today();
  return (
    <div>
      <h1 style={styles.h1}>Panel Principal</h1>
      <div style={styles.roomGrid}>
        {ROOMS.map(room => {
          const roomRes = data.reservations.filter(r => r.roomId===room.id && r.status!=="cancelada");
          const active = roomRes.filter(r => r.checkIn<=tod && r.checkOut>=tod);
          const upcoming = roomRes.filter(r => r.checkIn>tod).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
          const occupied = active.length > 0;
          return (
            <div key={room.id} style={{...styles.roomCard, borderTop:`4px solid ${room.color}`}}>
              <div style={styles.roomHeader}>
                <span style={{fontSize:28}}>{room.icon}</span>
                <div>
                  <div style={styles.roomName}>{room.name}</div>
                  <span style={{...styles.statusPill, background: occupied ? "#c0392b" : "#27ae60"}}>
                    {occupied ? "🔴 Ocupado" : "🟢 Disponible"}
                  </span>
                </div>
              </div>
              {active.map(r => (
                <div key={r.id} style={styles.resCard}>
                  <b>👤 {r.guestName}</b><br/>
                  <span style={{color:"#555",fontSize:13}}>📞 {r.phone}</span><br/>
                  <span style={{color:"#555",fontSize:13}}>📅 {fmt(r.checkIn)} → {fmt(r.checkOut)}</span>
                  {r.notes && <div style={{fontSize:12,color:"#777",marginTop:4}}>📝 {r.notes}</div>}
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <button style={styles.btnSm} onClick={()=>onOccupy(r.id)}>Marcar ocupado</button>
                    <button style={{...styles.btnSm,background:"#e74c3c"}} onClick={()=>onCancel(r.id)}>Cancelar</button>
                  </div>
                </div>
              ))}
              {upcoming.length > 0 && (
                <div style={{marginTop:8}}>
                  <div style={{fontSize:12,color:"#888",marginBottom:4}}>Próximas ({upcoming.length})</div>
                  {upcoming.slice(0,2).map(r => (
                    <div key={r.id} style={{...styles.resCard,background:"#f8f9fa",border:"1px solid #dfe6e9"}}>
                      <b style={{fontSize:13}}>👤 {r.guestName}</b>
                      <div style={{fontSize:12,color:"#666"}}>📅 {fmt(r.checkIn)} → {fmt(r.checkOut)}</div>
                      <div style={{display:"flex",gap:6,marginTop:6}}>
                        <button style={styles.btnSm} onClick={()=>onCancel(r.id)}>Cancelar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button style={{...styles.btnPrimary, marginTop:12, background: room.color}}
                onClick={()=>onModal({type:"newReservation", roomId: room.id})}>
                + Nueva Reservación
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Calendar ──────────────────────────────────────────────────────────────
function CalendarView({ data, mode, setMode, date, setDate, onModal }) {
  const d = new Date(date + "T12:00:00");
  const weather = getWeather(date);

  const moveDate = (delta) => {
    const nd = new Date(d);
    if (mode==="day") nd.setDate(nd.getDate()+delta);
    else if (mode==="week") nd.setDate(nd.getDate()+7*delta);
    else if (mode==="month") nd.setMonth(nd.getMonth()+delta);
    else nd.setFullYear(nd.getFullYear()+delta);
    setDate(nd.toISOString().slice(0,10));
  };

  const dateLabel = () => {
    if (mode==="day") return d.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    if (mode==="week") {
      const start = new Date(d); start.setDate(d.getDate()-d.getDay());
      const end = new Date(start); end.setDate(start.getDate()+6);
      return `${start.toLocaleDateString("es-MX",{day:"2-digit",month:"short"})} – ${end.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})}`;
    }
    if (mode==="month") return d.toLocaleDateString("es-MX",{month:"long",year:"numeric"});
    return d.getFullYear().toString();
  };

  // Build days for grid
  const getDays = () => {
    if (mode==="day") return [date];
    if (mode==="week") {
      const start = new Date(d); start.setDate(d.getDate()-d.getDay());
      return Array.from({length:7},(_,i)=>{const nd=new Date(start);nd.setDate(start.getDate()+i);return nd.toISOString().slice(0,10);});
    }
    if (mode==="month") {
      const year = d.getFullYear(), month = d.getMonth();
      const first = new Date(year,month,1);
      const last = new Date(year,month+1,0);
      const days = [];
      for (let i=0;i<first.getDay();i++) days.push(null);
      for (let i=1;i<=last.getDate();i++) days.push(`${year}-${String(month+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`);
      return days;
    }
    if (mode==="year") {
      const year = d.getFullYear();
      return Array.from({length:12},(_,m)=>`${year}-${String(m+1).padStart(2,"0")}-01`);
    }
  };

  const days = getDays();

  return (
    <div>
      <h1 style={styles.h1}>Calendario de Reservaciones</h1>
      {/* Weather bar */}
      {weather && (
        <div style={styles.weatherBar}>
          <span style={{fontSize:24}}>{weather.icon}</span>
          <div>
            <b>{weather.label}</b> · {weather.temp}
            <div style={{fontSize:12,color:"#555"}}>⚠️ Riesgo de clima severo: <b>{weather.risk}</b></div>
          </div>
          <button style={styles.btnSm} onClick={()=>onModal({type:"weather",date})}>Ver detalle</button>
        </div>
      )}
      {/* Controls */}
      <div style={styles.calControls}>
        <button style={styles.btnSm} onClick={()=>moveDate(-1)}>‹</button>
        <b style={{minWidth:220,textAlign:"center",fontSize:15,textTransform:"capitalize"}}>{dateLabel()}</b>
        <button style={styles.btnSm} onClick={()=>moveDate(1)}>›</button>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
          {["day","week","month","year"].map(m=>(
            <button key={m} style={{...styles.btnSm, background: mode===m?"#2d6a4f":"#ecf0f1", color: mode===m?"#fff":"#333"}}
              onClick={()=>setMode(m)}>{m==="day"?"Día":m==="week"?"Semana":m==="month"?"Mes":"Año"}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {mode==="month" && (
        <div>
          <div style={styles.weekDayRow}>
            {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d=><div key={d} style={styles.weekDayLabel}>{d}</div>)}
          </div>
          <div style={styles.monthGrid}>
            {days.map((day, i) => {
              if (!day) return <div key={i} style={styles.emptyCell}/>;
              const roomsToday = ROOMS.map(r=>({room:r,occ:isOccupied(data.reservations,r.id,day)}));
              const hasAny = roomsToday.some(x=>x.occ);
              const isToday = day===today();
              return (
                <div key={day} style={{...styles.calCell, background: isToday?"#e8f5e9":"#fff", border: isToday?"1.5px solid #2d6a4f":"1px solid #e0e0e0"}}>
                  <div style={{fontSize:12,fontWeight:600,color:isToday?"#2d6a4f":"#333",marginBottom:3}}>{day.slice(8)}</div>
                  {roomsToday.filter(x=>x.occ).map(x=>(
                    <div key={x.room.id} style={{fontSize:10,background:x.room.color,color:"#fff",borderRadius:3,padding:"1px 4px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {x.room.icon} {x.room.name.replace("Cuarto ","C. ")}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(mode==="day"||mode==="week") && (
        <div style={{overflowX:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${days.length},1fr)`,gap:8,minWidth:600}}>
            {days.map(day=>{
              const isToday=day===today();
              return (
                <div key={day} style={{border:"1px solid #e0e0e0",borderRadius:10,padding:12,background:isToday?"#e8f5e9":"#fff"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:isToday?"#2d6a4f":"#333",textTransform:"capitalize"}}>
                    {new Date(day+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})}
                  </div>
                  {ROOMS.map(room=>{
                    const occ=isOccupied(data.reservations,room.id,day);
                    const res = data.reservations.find(r=>r.roomId===room.id&&r.status!=="cancelada"&&r.checkIn<=day&&r.checkOut>=day);
                    return (
                      <div key={room.id} style={{borderRadius:6,padding:"5px 8px",marginBottom:5,background:occ?room.color+"22":"#f5f5f5",borderLeft:`3px solid ${room.color}`}}>
                        <div style={{fontSize:12,fontWeight:600}}>{room.icon} {room.name}</div>
                        {occ&&res ? <div style={{fontSize:11,color:"#555"}}>👤 {res.guestName}</div> : <div style={{fontSize:11,color:"#999"}}>Disponible</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode==="year" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
          {days.map(monthDate=>{
            const m = new Date(monthDate+"T12:00:00");
            const year=m.getFullYear(),month=m.getMonth();
            const daysInMonth = new Date(year,month+1,0).getDate();
            const monthDays = Array.from({length:daysInMonth},(_,i)=>`${year}-${String(month+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
            const occupiedDays = monthDays.filter(d=>ROOMS.some(r=>isOccupied(data.reservations,r.id,d)));
            const pct = Math.round(occupiedDays.length/daysInMonth*100);
            return (
              <div key={monthDate} style={{border:"1px solid #e0e0e0",borderRadius:10,padding:14,background:"#fff"}}>
                <b style={{textTransform:"capitalize"}}>{m.toLocaleDateString("es-MX",{month:"long"})}</b>
                <div style={{marginTop:8}}>
                  <div style={{height:8,background:"#ecf0f1",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:"#2d6a4f",borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:12,color:"#666",marginTop:4}}>{occupiedDays.length}/{daysInMonth} días con reservaciones</div>
                </div>
                {ROOMS.map(room=>{
                  const roomOcc=monthDays.filter(d=>isOccupied(data.reservations,room.id,d));
                  return roomOcc.length>0 ? (
                    <div key={room.id} style={{fontSize:12,marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:room.color}}/>
                      {room.name}: <b>{roomOcc.length}d</b>
                    </div>
                  ) : null;
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick book */}
      <div style={{marginTop:20,display:"flex",gap:10,flexWrap:"wrap"}}>
        {ROOMS.map(room=>(
          <button key={room.id} style={{...styles.btnPrimary,background:room.color}}
            onClick={()=>onModal({type:"newReservation",roomId:room.id})}>
            {room.icon} Reservar {room.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── History ───────────────────────────────────────────────────────────────
function HistoryView({ data }) {
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const hist = data.history.filter(h =>
    (roomFilter==="all"||h.roomId===roomFilter) &&
    (h.guestName.toLowerCase().includes(search.toLowerCase())||h.phone.includes(search))
  ).sort((a,b)=>b.checkIn.localeCompare(a.checkIn));

  return (
    <div>
      <h1 style={styles.h1}>Historial de Huéspedes</h1>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <input placeholder="🔍 Buscar nombre o teléfono..." value={search} onChange={e=>setSearch(e.target.value)}
          style={styles.input}/>
        <select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)} style={styles.input}>
          <option value="all">Todos los cuartos</option>
          {ROOMS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {hist.length===0 ? <p style={{color:"#999"}}>No hay registros aún.</p> : (
        <div style={{overflowX:"auto"}}>
          <table style={styles.table}>
            <thead><tr>
              {["Cuarto","Huésped","Teléfono","Entrada","Salida","Noches"].map(h=><th key={h} style={styles.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {hist.map(h=>{
                const room = ROOMS.find(r=>r.id===h.roomId);
                const nights = Math.round((new Date(h.checkOut)-new Date(h.checkIn))/(1000*60*60*24));
                return (
                  <tr key={h.id} style={{borderBottom:"1px solid #ecf0f1"}}>
                    <td style={styles.td}><span style={{color:room?.color,fontWeight:600}}>{room?.icon} {room?.name}</span></td>
                    <td style={styles.td}>{h.guestName}</td>
                    <td style={styles.td}>{h.phone}</td>
                    <td style={styles.td}>{fmt(h.checkIn)}</td>
                    <td style={styles.td}>{fmt(h.checkOut)}</td>
                    <td style={styles.td}>{nights}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Services ──────────────────────────────────────────────────────────────
function ServicesView({ data, onModal, onResolve }) {
  const pending = data.serviceRequests.filter(s=>s.status==="pendiente");
  const done = data.serviceRequests.filter(s=>s.status==="resuelto");
  return (
    <div>
      <h1 style={styles.h1}>Servicios y Reparaciones</h1>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <button style={styles.btnPrimary} onClick={()=>onModal({type:"newService"})}>🔧 Nueva solicitud de servicio</button>
        <button style={{...styles.btnPrimary,background:"#e67e22"}} onClick={()=>onModal({type:"newRepair"})}>🛠️ Registrar reparación</button>
      </div>

      {pending.length>0&&<h3 style={{color:"#c0392b",marginBottom:8}}>⚠️ Servicios Pendientes ({pending.length})</h3>}
      {pending.map(s=>{
        const room=ROOMS.find(r=>r.id===s.roomId);
        return (
          <div key={s.id} style={{...styles.serviceCard,borderLeft:`4px solid ${room?.color}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <b>{room?.icon} {room?.name}</b>
                <div style={{fontSize:13,color:"#555",marginTop:4}}>{s.services?.join(", ")}</div>
                {s.notes&&<div style={{fontSize:12,color:"#777",marginTop:3}}>📝 {s.notes}</div>}
                <div style={{fontSize:12,color:"#999",marginTop:3}}>📅 {fmt(s.date)}</div>
              </div>
              <button style={{...styles.btnSm,background:"#27ae60",color:"#fff"}} onClick={()=>onResolve(s.id)}>✓ Resolver</button>
            </div>
          </div>
        );
      })}

      <h3 style={{marginTop:20,marginBottom:8}}>🛠️ Reparaciones Registradas</h3>
      {data.repairs.length===0 ? <p style={{color:"#999"}}>Sin reparaciones registradas.</p> : (
        data.repairs.sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
          const room=ROOMS.find(rm=>rm.id===r.roomId);
          return (
            <div key={r.id} style={styles.serviceCard}>
              <b>{room?.icon} {room?.name}</b>
              <div style={{fontSize:13,marginTop:4}}>{r.description}</div>
              <div style={{fontSize:12,color:"#555",marginTop:4}}>🔧 Técnico: <b>{r.techName}</b> · 📞 {r.techPhone}</div>
              <div style={{fontSize:12,color:"#555"}}>📅 Fecha reparación: {fmt(r.repairDate)} · Registrado: {fmt(r.date)}</div>
            </div>
          );
        })
      )}

      {done.length>0&&(
        <>
          <h3 style={{marginTop:20,marginBottom:8,color:"#27ae60"}}>✅ Servicios Resueltos</h3>
          {done.slice(-5).reverse().map(s=>{
            const room=ROOMS.find(r=>r.id===s.roomId);
            return (
              <div key={s.id} style={{...styles.serviceCard,opacity:0.7}}>
                <b>{room?.icon} {room?.name}</b>: {s.services?.join(", ")}
                <span style={{fontSize:12,color:"#27ae60",marginLeft:8}}>✓ Resuelto</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Public Link ───────────────────────────────────────────────────────────
function PublicLink() {
  const [copied, setCopied] = useState(false);
  const link = window.location.href;
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <div>
      <h1 style={styles.h1}>Vista Pública para Huéspedes</h1>
      <div style={{background:"#e8f5e9",border:"1px solid #a8d5b5",borderRadius:12,padding:20,marginBottom:20}}>
        <b>🔗 Comparte este enlace con tus huéspedes:</b>
        <div style={{display:"flex",gap:10,marginTop:10,alignItems:"center",flexWrap:"wrap"}}>
          <input readOnly value={link} style={{...styles.input,flex:1,background:"#fff",fontSize:13}}/>
          <button style={styles.btnPrimary} onClick={copy}>{copied?"✅ Copiado!":"📋 Copiar"}</button>
        </div>
        <p style={{fontSize:13,color:"#555",marginTop:10}}>
          Tus huéspedes podrán ver qué fechas están ocupadas sin poder editar nada.
          La información se actualiza automáticamente cada vez que haces cambios.
        </p>
      </div>
      <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:20}}>
        <h3 style={{marginBottom:12}}>👁️ Vista previa del calendario público</h3>
        <PublicCalendarPreview />
      </div>
    </div>
  );
}

function PublicCalendarPreview() {
  const [pubData, setPubData] = useState(null);
  useEffect(()=>{
    window.storage.get(SHARED_KEY, true).then(r=> r ? setPubData(JSON.parse(r.value)) : null).catch(()=>{});
  },[]);
  if (!pubData) return <p style={{color:"#999"}}>Cargando vista pública...</p>;
  const tod = today();
  const months = Array.from({length:3},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()+i);return d;});
  return (
    <div>
      {months.map(m=>{
        const year=m.getFullYear(),month=m.getMonth();
        const daysInMonth=new Date(year,month+1,0).getDate();
        const firstDay=new Date(year,month,1).getDay();
        return (
          <div key={month} style={{marginBottom:20}}>
            <b style={{textTransform:"capitalize"}}>{m.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}</b>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginTop:8}}>
              {["D","L","M","X","J","V","S"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"#999",fontWeight:600}}>{d}</div>)}
              {Array.from({length:firstDay},(_,i)=><div key={"e"+i}/>)}
              {Array.from({length:daysInMonth},(_,i)=>{
                const day=`${year}-${String(month+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`;
                const occs=(pubData.rooms||ROOMS).filter(r=>
                  (pubData.reservations||[]).some(res=>res.roomId===r.id&&res.checkIn<=day&&res.checkOut>=day)
                );
                const isPast=day<tod;
                return (
                  <div key={day} style={{textAlign:"center",padding:"4px 2px",borderRadius:4,
                    background:occs.length>0?"#fdecea":isPast?"#f5f5f5":"#e8f5e9",
                    fontSize:11,color:isPast?"#bbb":"#333"}}>
                    {i+1}
                    {occs.length>0&&<div style={{fontSize:9,color:"#c0392b"}}>●</div>}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:12,marginTop:6,fontSize:11}}>
              <span>🟢 Disponible</span><span>🔴 Ocupado</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────
function ReservationModal({ roomId, onSave, onClose, data }) {
  const [form, setForm] = useState({ roomId, guestName:"", phone:"", checkIn:today(), checkOut:"", notes:"" });
  const set = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const conflict = form.checkIn && form.checkOut && ROOMS.some(r=>r.id===form.roomId) &&
    data.reservations.some(r=>r.roomId===form.roomId&&r.status!=="cancelada"&&!(r.checkOut<form.checkIn||r.checkIn>form.checkOut));
  return (
    <Modal title="Nueva Reservación" onClose={onClose}>
      <label style={styles.label}>Cuarto</label>
      <select value={form.roomId} onChange={set("roomId")} style={styles.input}>
        {ROOMS.map(r=><option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
      </select>
      <label style={styles.label}>Nombre del huésped</label>
      <input value={form.guestName} onChange={set("guestName")} style={styles.input} placeholder="Nombre completo"/>
      <label style={styles.label}>Teléfono</label>
      <input value={form.phone} onChange={set("phone")} style={styles.input} placeholder="+52 ..."/>
      <label style={styles.label}>Fecha de entrada</label>
      <input type="date" value={form.checkIn} onChange={set("checkIn")} style={styles.input}/>
      <label style={styles.label}>Fecha de salida</label>
      <input type="date" value={form.checkOut} onChange={set("checkOut")} style={styles.input}/>
      {conflict && <div style={{color:"#c0392b",fontSize:13,marginBottom:8}}>⚠️ Ya existe una reservación en esas fechas para este cuarto.</div>}
      <label style={styles.label}>Notas (opcional)</label>
      <textarea value={form.notes} onChange={set("notes")} style={{...styles.input,height:70}} placeholder="Peticiones especiales..."/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <button style={styles.btnPrimary} onClick={()=>{if(!conflict&&form.guestName&&form.checkOut)onSave(form);}} disabled={conflict||!form.guestName||!form.checkOut}>Guardar</button>
        <button style={styles.btnSm} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

function ServiceModal({ onSave, onClose }) {
  const [form, setForm] = useState({ roomId:"laguna", services:[], notes:"" });
  const toggle = s => setForm(p=>({...p, services: p.services.includes(s)?p.services.filter(x=>x!==s):[...p.services,s]}));
  return (
    <Modal title="Nueva Solicitud de Servicio" onClose={onClose}>
      <label style={styles.label}>Cuarto</label>
      <select value={form.roomId} onChange={e=>setForm(p=>({...p,roomId:e.target.value}))} style={styles.input}>
        {ROOMS.map(r=><option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
      </select>
      <label style={styles.label}>Servicios requeridos</label>
      {SERVICES.map(s=>(
        <label key={s} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer"}}>
          <input type="checkbox" checked={form.services.includes(s)} onChange={()=>toggle(s)} style={{width:16,height:16}}/>
          {s}
        </label>
      ))}
      <label style={styles.label}>Notas adicionales</label>
      <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{...styles.input,height:60}}/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <button style={styles.btnPrimary} onClick={()=>{if(form.services.length>0)onSave(form);}}>Guardar</button>
        <button style={styles.btnSm} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

function RepairModal({ onSave, onClose }) {
  const [form, setForm] = useState({ roomId:"laguna", description:"", techName:"", techPhone:"", repairDate:today() });
  const set = k => e => setForm(p=>({...p,[k]:e.target.value}));
  return (
    <Modal title="Registrar Reparación" onClose={onClose}>
      <label style={styles.label}>Cuarto</label>
      <select value={form.roomId} onChange={set("roomId")} style={styles.input}>
        {ROOMS.map(r=><option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
      </select>
      <label style={styles.label}>Descripción de la reparación</label>
      <textarea value={form.description} onChange={set("description")} style={{...styles.input,height:70}} placeholder="¿Qué se reparó?"/>
      <label style={styles.label}>Nombre del técnico</label>
      <input value={form.techName} onChange={set("techName")} style={styles.input} placeholder="Nombre completo"/>
      <label style={styles.label}>Teléfono del técnico</label>
      <input value={form.techPhone} onChange={set("techPhone")} style={styles.input} placeholder="+52 ..."/>
      <label style={styles.label}>Fecha de reparación</label>
      <input type="date" value={form.repairDate} onChange={set("repairDate")} style={styles.input}/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <button style={styles.btnPrimary} onClick={()=>{if(form.description&&form.techName)onSave(form);}}>Guardar</button>
        <button style={styles.btnSm} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

function WeatherModal({ date, onClose }) {
  const w = getWeather(date);
  const months=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return (
    <Modal title="Monitor del Clima" onClose={onClose}>
      <div style={{textAlign:"center",padding:"16px 0"}}>
        <div style={{fontSize:60}}>{w.icon}</div>
        <h2 style={{margin:"8px 0",color:"#2d6a4f"}}>{w.label}</h2>
        <div style={{fontSize:22,fontWeight:700,color:"#333"}}>{w.temp}</div>
        <div style={{marginTop:8,padding:"8px 16px",background:"#fdecea",borderRadius:8,display:"inline-block"}}>
          ⚠️ Riesgo: <b>{w.risk}</b>
        </div>
      </div>
      <div style={{marginTop:16}}>
        <b>Clima típico por mes en la zona costera:</b>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:8}}>
          {months.map((m,i)=>{
            const mw=getWeather(`2024-${String(i+1).padStart(2,"0")}-15`);
            return (
              <div key={m} style={{textAlign:"center",padding:"8px 4px",border:"1px solid #e0e0e0",borderRadius:8,fontSize:12}}>
                <div style={{fontSize:18}}>{mw.icon}</div>
                <div style={{fontWeight:600}}>{m}</div>
                <div style={{color:"#666",fontSize:11}}>{mw.temp.split("–")[0]}°</div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={styles.modalBox}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{margin:0,fontSize:18,color:"#2d6a4f"}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = {
  shell:{display:"flex",minHeight:"100vh",background:"#f0f4f1",fontFamily:"'Segoe UI',system-ui,sans-serif"},
  sidebar:{width:200,minWidth:200,background:"#1a3a2a",color:"#fff",display:"flex",flexDirection:"column",padding:"20px 0",gap:4},
  logo:{display:"flex",alignItems:"center",gap:10,padding:"0 16px 20px",borderBottom:"1px solid rgba(255,255,255,0.1)"},
  logoText:{fontWeight:700,fontSize:18,color:"#a8d5b5"},
  navBtn:{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",color:"rgba(255,255,255,0.85)",border:"none",cursor:"pointer",fontSize:14,transition:"all .15s",textAlign:"left",position:"relative"},
  badge:{background:"#e74c3c",color:"#fff",borderRadius:10,fontSize:11,padding:"1px 6px",marginLeft:"auto"},
  main:{flex:1,padding:"28px 32px",overflowY:"auto"},
  h1:{margin:"0 0 20px",fontSize:24,fontWeight:700,color:"#1a3a2a",borderBottom:"2px solid #a8d5b5",paddingBottom:10},
  roomGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:20},
  roomCard:{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"},
  roomHeader:{display:"flex",gap:12,alignItems:"flex-start",marginBottom:12},
  roomName:{fontWeight:700,fontSize:16,color:"#1a3a2a"},
  statusPill:{fontSize:12,fontWeight:600,color:"#fff",padding:"2px 10px",borderRadius:20},
  resCard:{background:"#f8fffe",border:"1px solid #b8e0c8",borderRadius:8,padding:10,marginBottom:8},
  btnPrimary:{background:"#2d6a4f",color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600},
  btnSm:{background:"#ecf0f1",color:"#333",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:500},
  calControls:{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"},
  weekDayRow:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4},
  weekDayLabel:{textAlign:"center",fontSize:11,fontWeight:600,color:"#999",padding:"4px 0"},
  monthGrid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4},
  calCell:{borderRadius:6,padding:"6px 4px",minHeight:60,background:"#fff",border:"1px solid #e0e0e0",overflow:"hidden"},
  emptyCell:{borderRadius:6,background:"transparent"},
  weatherBar:{display:"flex",alignItems:"center",gap:14,background:"#e8f4fd",border:"1px solid #aed6f1",borderRadius:10,padding:"10px 16px",marginBottom:16,flexWrap:"wrap"},
  table:{width:"100%",borderCollapse:"collapse",background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  th:{background:"#1a3a2a",color:"#fff",padding:"10px 14px",textAlign:"left",fontSize:13},
  td:{padding:"9px 14px",fontSize:13,color:"#333"},
  serviceCard:{background:"#fff",borderRadius:10,padding:14,marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e0e0e0"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16},
  modalBox:{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 10px 40px rgba(0,0,0,0.2)"},
  input:{width:"100%",border:"1px solid #ddd",borderRadius:8,padding:"8px 12px",fontSize:14,marginBottom:10,boxSizing:"border-box",background:"#fafafa"},
  label:{display:"block",fontSize:12,fontWeight:600,color:"#555",marginBottom:4},
  toast:{position:"fixed",top:20,right:20,background:"#2d6a4f",color:"#fff",padding:"12px 20px",borderRadius:10,zIndex:9999,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",fontSize:14},
};

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  button:hover { opacity: 0.88; }
  input:focus, select:focus, textarea:focus { outline: 2px solid #2d6a4f; border-color: #2d6a4f; background: #fff; }
  textarea { resize: vertical; font-family: inherit; }
  @media (max-width: 640px) {
    .sidebar { width: 60px !important; min-width: 60px !important; }
    .sidebar span:last-child { display: none; }
    .main { padding: 16px !important; }
  }
`;
