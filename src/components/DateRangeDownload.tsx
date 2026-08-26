"use client"

import { useState } from "react"
import { toast } from "sonner"

type DateRangeDownloadProps = {
  disabled?: boolean
  entityLabel?: string
  onDownload: (dateFrom: string, dateTo: string) => Promise<void> | void
}

export default function DateRangeDownload({
  disabled = false,
  entityLabel = "student",
  onDownload,
}: DateRangeDownloadProps) {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const handleDownload = () => {
    if (!dateFrom || !dateTo) {
      toast.error("Select both the from date and to date")
      return
    }
    if (dateFrom > dateTo) {
      toast.error("From date cannot be after to date")
      return
    }
    void onDownload(dateFrom, dateTo)
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 10,
        flexWrap: "wrap",
        padding: 12,
        marginBottom: 16,
        border: "1px solid #bfdbfe",
        borderRadius: 12,
        background: "#eff6ff",
      }}
    >
      <div style={{ flex: "1 1 155px", maxWidth: 220 }}>
        <label htmlFor={`date-from-${entityLabel}`} style={{ display: "block", marginBottom: 5, color: "#475569", fontSize: 12, fontWeight: 700 }}>
          From submission date
        </label>
        <input
          id={`date-from-${entityLabel}`}
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          disabled={disabled}
          onChange={(event) => setDateFrom(event.target.value)}
          style={{ width: "100%", height: 40, padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: 8, background: "white", fontSize: 13 }}
        />
      </div>
      <div style={{ flex: "1 1 155px", maxWidth: 220 }}>
        <label htmlFor={`date-to-${entityLabel}`} style={{ display: "block", marginBottom: 5, color: "#475569", fontSize: 12, fontWeight: 700 }}>
          To submission date
        </label>
        <input
          id={`date-to-${entityLabel}`}
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          disabled={disabled}
          onChange={(event) => setDateTo(event.target.value)}
          style={{ width: "100%", height: 40, padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: 8, background: "white", fontSize: 13 }}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled || !dateFrom || !dateTo}
        onClick={handleDownload}
        title={`Download ${entityLabel} data and photos submitted during this inclusive date range`}
        style={{ minHeight: 40, padding: "9px 16px", opacity: disabled || !dateFrom || !dateTo ? 0.6 : 1 }}
      >
        {disabled ? "Preparing Download…" : "Download Date Range Data + Photos"}
      </button>
      <span style={{ flex: "1 1 240px", color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
        Includes both selected dates and respects the current section and status filters.
      </span>
    </div>
  )
}
