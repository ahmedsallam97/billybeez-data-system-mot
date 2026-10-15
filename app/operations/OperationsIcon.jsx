export default function OperationsIcon({name}) {
  const paths={
    dashboard:"M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
    employees:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7a4 4 0 0 1 0 8m2 3a4 4 0 0 1 3 4v2",
    schedule:"M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m1 10h3m3 0h3m-9 4h3m3 0h3",
    daily:"M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    roster:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3 2 2 5-6",
    evaluation:"M9 3h6v4H9V3Zm-2 2H4v16h16V5h-3M8 13l3 3 5-6",
    performance:"M4 20V10m8 10V4m8 16v-7M2 22h20",
    eotm:"M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 1v5m-4 3h8m-8 0v-3h8v3",
    hall:"m12 3 3 5 6 1-4 4 1 7-6-3-6 3 1-7-4-4 6-1 3-5",
    development:"M4 20V10m8 10V4m8 16v-7M2 22h20",
    operationalReports:"M14 2H5v20h14V7l-5-5v5h5M8 17v-4m4 4V9m4 8v-6",
    succession:"M9 3h6v5H9V3ZM3 16h6v5H3v-5Zm12 0h6v5h-6v-5ZM12 8v4m-6 4v-4h12v4",
    trips:"M4 17V6h16v11H4Zm0-7h16M7 3h10M7 17v4m10-4v4M7 14h1m8 0h1",
    birthdays:"M3 21h18v-9H3v9Zm3-9V8h12v4M8 8V4m4 4V2m4 6V4M3 16q3 4 6 0 3 4 6 0 3 4 6 0",
    offers:"m3 3 9 0 9 9-9 9-9-9V3Zm4 4h.01",
    stock:"m3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v11m-5-17 9 4",
    time:"M5 3h14v18H5V3Zm4 4h6m-6 4h6m-6 4h2m4-1 2 2-4 4",
    reports:"M14 2H5v20h14V7l-5-5v5h5M8 17v-4m4 4V9m4 8v-6",
    audit:"m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
    settings:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-6h4l1 3 3 1 3 1v4l-3 2-1 3 1 3-3 2-3-1-3 1-3-2 1-3-1-3-3-2V7l3-1 3-1 1-3",
    expand:"M3 4h18v16H3V4Zm5 0v16m5-12 4 4-4 4",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.dashboard}/></svg>;
}
