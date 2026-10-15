"use client";
import styles from '../PlanningWorkspace.module.css';
import {DataTable} from '../../ui/DesktopLayout';
// One semantic table on every size; small screens expose the same cells as labelled records.
export default function PlanningTable({columns,rows,caption}) {
 return <DataTable className={styles.scroll} label={caption||columns.join(' · ')}>
  <table className={`${styles.table} ${styles.responsiveTable}`} data-responsive-table>
   {caption&&<caption className={styles.tableCaption}>{caption}</caption>}
   <thead><tr>{columns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>{row.cells.map((cell,index)=><td key={columns[index]} data-label={columns[index]}>{cell}</td>)}</tr>)}</tbody>
  </table>
 </DataTable>;
}
