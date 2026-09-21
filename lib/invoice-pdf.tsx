import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CompanySettings, InvoiceLine, InvoiceRecord } from "@/lib/invoices";

const INK = "#0C1E33";
const MUTED = "#556577";
const LINE = "#DCE3EA";

const s = StyleSheet.create({
  page: { padding: 44, fontFamily: "Helvetica", fontSize: 10, color: "#0E1C2B", lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 14 },
  company: { fontFamily: "Helvetica-Bold", fontSize: 15, color: INK, lineHeight: 1.2, marginBottom: 3 },
  muted: { color: MUTED },
  title: { fontFamily: "Helvetica-Bold", fontSize: 20, color: INK, textAlign: "right" },
  voidMark: { fontFamily: "Helvetica-Bold", fontSize: 12, color: "#A32A2A", textAlign: "right", marginTop: 2 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 18, gap: 24 },
  metaCol: { flex: 1 },
  label: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  tableHead: { flexDirection: "row", backgroundColor: INK, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9, paddingVertical: 6, paddingHorizontal: 8, marginTop: 22 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 6, paddingHorizontal: 8 },
  cDesc: { flex: 1, paddingRight: 8 },
  cNum: { width: 70, textAlign: "right" },
  detail: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  totals: { marginTop: 12, marginLeft: "auto", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 2, borderTopColor: INK, marginTop: 4, paddingTop: 6, fontFamily: "Helvetica-Bold", fontSize: 12, color: INK },
  footer: { marginTop: 26, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 },
});

const money = (n: number) => "$" + Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hours = (n: number) => String(Math.round(n * 100) / 100);
const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

function InvoiceDocument({ invoice, lines, settings }: { invoice: InvoiceRecord; lines: InvoiceLine[]; settings: CompanySettings }) {
  return (
    <Document title={`${invoice.invoice_no} ${settings.company_name}`} author={settings.company_name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.company}>{settings.company_name}</Text>
            {settings.company_tagline ? <Text style={s.muted}>{settings.company_tagline}</Text> : null}
            {settings.address ? <Text style={[s.muted, { marginTop: 4 }]}>{settings.address}</Text> : null}
            {settings.contact_line ? <Text style={s.muted}>{settings.contact_line}</Text> : null}
            {settings.gst_number ? <Text style={s.muted}>GST No: {settings.gst_number}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>TAX INVOICE</Text>
            {invoice.status === "void" ? <Text style={s.voidMark}>VOID</Text> : null}
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaCol}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.bold}>{invoice.client?.name ?? "—"}</Text>
            {invoice.client?.address ? <Text>{invoice.client.address}</Text> : null}
            <Text style={[s.label, { marginTop: 10 }]}>Project</Text>
            <Text style={s.bold}>{invoice.project?.name}</Text>
            <Text>Project No: {invoice.project?.project_no}</Text>
          </View>
          <View style={s.metaCol}>
            <View style={s.metaRow}><Text style={s.muted}>Invoice No</Text><Text style={s.bold}>{invoice.invoice_no}</Text></View>
            <View style={s.metaRow}><Text style={s.muted}>Invoice date</Text><Text>{date(invoice.issued_on)}</Text></View>
            <View style={s.metaRow}><Text style={s.muted}>Due date</Text><Text>{date(invoice.due_on)}</Text></View>
            <View style={s.metaRow}><Text style={s.muted}>Period</Text><Text>{date(invoice.period_from)} to {date(invoice.period_to)}</Text></View>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={s.cDesc}>Description of work</Text>
          <Text style={s.cNum}>Hours</Text>
          <Text style={s.cNum}>Rate ($/hr)</Text>
          <Text style={s.cNum}>Amount ($)</Text>
        </View>
        {lines.map((line, i) => (
          <View key={i} style={s.row} wrap={false}>
            <View style={s.cDesc}>
              <Text>{line.description}</Text>
              {line.detail ? <Text style={s.detail}>{line.detail}</Text> : null}
            </View>
            <Text style={s.cNum}>{hours(line.hours)}</Text>
            <Text style={s.cNum}>{line.rate === null ? "" : money(line.rate)}</Text>
            <Text style={s.cNum}>{money(line.amount)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}><Text>Subtotal (excl. GST)</Text><Text>{money(invoice.subtotal)}</Text></View>
          <View style={s.totalRow}><Text>GST @ {percent(invoice.gst_rate)}</Text><Text>{money(invoice.gst)}</Text></View>
          <View style={s.grand}><Text>TOTAL DUE (incl. GST)</Text><Text>{money(invoice.total)}</Text></View>
          <View style={[s.totalRow, { marginTop: 6 }]}><Text style={s.muted}>Total hours billed</Text><Text style={s.muted}>{hours(invoice.total_hours)}</Text></View>
        </View>

        <View style={s.footer} wrap={false}>
          <Text>
            Payment terms: {settings.payment_terms_days} days from invoice date. Please quote the invoice number {invoice.invoice_no} with your payment.
          </Text>
          {settings.bank_details ? <Text style={{ marginTop: 6 }}>{settings.bank_details}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(props: { invoice: InvoiceRecord; lines: InvoiceLine[]; settings: CompanySettings }): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...props} />);
}
