"use client";

const ENGLISH_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function initials(name) {
  return String(name || "BB").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function displayName(employee) {
  return employee?.nameEn || employee?.name || "BILLY BEEZ STAR";
}

function EmployeePhoto({ employee, hall = false }) {
  const photoUrl = employee?.photoUrl || employee?.imageUrl || employee?.photo || "";
  return <div className={`eotm-master-photo ${hall ? "hall-photo" : ""}`}>
    {photoUrl ? <img src={photoUrl} alt={displayName(employee)} /> : <span aria-label={employee ? `Photo placeholder for ${employee.name}` : "Awaiting winner photo"}>{employee ? initials(employee.nameEn || employee.name) : "—"}</span>}
  </div>;
}

function Brand() {
  return <div className="eotm-master-brand"><img src="/bb-logo-fast.png" alt="Billy Beez" /><span>PLAY · LEARN · GROW</span></div>;
}

export function MonthlyWinnerArtwork({ winner, variant = "T01" }) {
  if (!winner) return null;
  const name = displayName(winner.employee);
  const firstName = name.trim().split(/\s+/)[0];
  return <article className={`recognition-artwork eotm-master-artwork eotm-${variant.toLowerCase()}`} data-recognition-kind="monthly" dir="ltr">
    <div className="eotm-corner corner-one" aria-hidden="true" /><div className="eotm-corner corner-two" aria-hidden="true" />
    <div className="eotm-burst burst-one" aria-hidden="true">•••</div><div className="eotm-burst burst-two" aria-hidden="true">•••</div>
    <Brand />
    <div className="eotm-master-title"><b>Employee</b><strong>of The Month</strong><i aria-hidden="true" /></div>
    <div className="eotm-photo-frame"><EmployeePhoto employee={winner.employee} /></div>
    <div className="eotm-name-ribbon">{name}</div>
    <div className="eotm-master-period"><i />{ENGLISH_MONTHS[winner.month - 1]} {winner.year}<b>·</b>{winner.branch || "MOT"}<i /></div>
    <div className="eotm-master-message"><b>Congratulations, {firstName}!</b><span>We are proud to have you on our team.</span></div>
    <div className="eotm-side-copy side-left">SAME<br />TEAM<br />BIGGER<br />SMILES</div>
    <div className="eotm-side-copy side-right">GREAT<br />PEOPLE<br />BRIGHTER<br />TOMORROWS</div>
    <div className="eotm-bee-watermark" aria-hidden="true">B</div>
  </article>;
}

export function HallOfFameArtwork({ winners, yearLabel }) {
  const year = Number(yearLabel) || new Date().getFullYear();
  const slots = ENGLISH_MONTHS.map((month, index) => ({ month, winner: winners.find((item) => item.year === year && item.month === index + 1) || null }));
  return <article className="recognition-artwork hall-master-artwork" data-recognition-kind="hall" dir="ltr">
    <div className="hall-wave hall-wave-top" aria-hidden="true" /><div className="hall-wave hall-wave-bottom" aria-hidden="true" />
    <header><div className="hall-slogan">GREAT<br />PEOPLE<br />BRIGHTER<br />TOMORROWS</div><Brand /><b>{year}</b></header>
    <div className="hall-master-heading"><div className="hall-crown" aria-hidden="true">♛</div><h2>HALL <span>OF</span> FAME</h2><h3>OUR EMPLOYEES OF THE MONTH</h3><p>A YEAR OF DEDICATION, PASSION AND IMPACT</p></div>
    <div className="hall-month-grid">{slots.map(({ month, winner }, index) => <section className={`hall-month-card ${index % 2 ? "yellow" : "purple"}`} key={month}>
      <div className="hall-month-label">{month}</div>
      <EmployeePhoto employee={winner?.employee} hall />
      <b>{winner ? displayName(winner.employee) : "TBA"}</b>
      <span>{winner ? `${winner.branch || "MOT"} Branch` : "Awaiting finalized winner"}</span>
    </section>)}</div>
    <section className="hall-appreciation"><h3>To Our Amazing Team,</h3><p>As we close another incredible year, we proudly celebrate our Employees of the Month — individuals who truly represent the spirit of Billy Beez. Your hard work, positive attitude, and commitment to excellence make a real difference every day.</p><p>Each of you has shown what it means to go above and beyond. Your dedication helps us build a brighter, happier, and more successful Billy Beez.</p><strong>Thank you for being the heart of our success!</strong><small>Here’s to an even more exciting year ahead — more growth, more achievements, and many more smiles together!</small></section>
    <footer className="hall-values"><div><b>♢</b><span>Safety<br />Always</span></div><div><b>♚</b><span>Stronger<br />Together</span></div><div><b>▥</b><span>Bigger<br />Possibilities</span></div><div><b>♥</b><span>Happier<br />Guests</span></div><div><b>★</b><span>Brighter<br />Future</span></div><section><small>With Appreciation,</small><strong>Billy Beez Management</strong></section></footer>
  </article>;
}
