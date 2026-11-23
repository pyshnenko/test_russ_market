const paths = {
  left: "M14 6l-6 6 6 6",
  right: "M10 6l6 6-6 6",
  down: "m6 9 6 6 6-6",
  search: "M21 21l-4.4-4.4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  calendar: "M7 2v4m10-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm6 11v-7h6v7",
  panel: "M9 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  edit: "m14 5 5 5M4 20l4-1L20 7l-4-4L4 15Z",
  close: "m6 6 12 12M18 6 6 18",
  grid: "M4 4h16v16H4zM12 4v16M4 12h16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7",
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
