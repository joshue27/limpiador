'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type Props = {
  data: { labels: string[]; outbound: number[]; inbound: number[] };
};

export function MessageChart({ data }: Props) {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Enviados',
        data: data.outbound,
        backgroundColor: '#075e54',
        borderRadius: 4,
      },
      {
        label: 'Recibidos',
        data: data.inbound,
        backgroundColor: '#10b981',
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
    },
    scales: {
      y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f3f4f6' } },
      x: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
  };

  return (
    <div style={{ height: 200 }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

export function DepartmentChart({ labels, counts }: { labels: string[]; counts: number[] }) {
  const chartData = {
    labels,
    datasets: [{
      label: 'Enviados (30 días)',
      data: counts,
      backgroundColor: labels.map((_, i) => {
        const colors = ['#075e54', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];
        return colors[i % colors.length];
      }),
      borderRadius: 4,
    }],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f3f4f6' } },
      y: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
  };

  return (
    <div style={{ height: Math.max(150, labels.length * 35) }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
