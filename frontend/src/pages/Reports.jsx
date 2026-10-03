import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../services/api';

function Reports() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReports = async () => {
      try {
        const response = await api.get('/projects');
        const projectReports = await Promise.all((response.data || []).map(async (project) => {
          const reportResponse = await api.get(`/projects/${project._id}/report`);
          return { project, ...reportResponse.data };
        }));
        setReports(projectReports);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Reports could not be loaded.');
      }
    };
    loadReports();
  }, []);

  const allTasks = reports.flatMap((report) => report.tasks || []);
  const completedTasks = allTasks.filter((task) => task.status === 'completed').length;
  const pendingReviews = reports.reduce((total, report) => (
    total + (report.submissions || []).filter((submission) => submission.reviewStatus === 'pending').length
  ), 0);
  const projectProgress = reports.length
    ? Math.round(reports.reduce((total, report) => total + (report.project.progress || 0), 0) / reports.length)
    : 0;
  const memberIds = new Set(reports.flatMap((report) => report.project.developers || []));

  const downloadReport = (report) => {
    const content = JSON.stringify(report || reports, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = report
      ? `${report.project.name.replace(/[^a-z0-9-]/gi, '-')}-report.json`
      : 'workspace-reports.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Analyze projects, tasks and team performance.</p>
        </div>
        <button className="primary-button" onClick={() => downloadReport()} disabled={!reports.length}>
          <Download size={16} /> Export Reports
        </button>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <div className="report-summary">
        <div><TrendingUp size={20} /><span>Project Progress</span><strong>{projectProgress}%</strong></div>
        <div><CheckCircle2 size={20} /><span>Tasks Completed</span><strong>{completedTasks}</strong></div>
        <div><Clock3 size={20} /><span>Pending Reviews</span><strong>{pendingReviews}</strong></div>
        <div><Users size={20} /><span>Project Members</span><strong>{memberIds.size}</strong></div>
      </div>

      <div className="reports-card">
        <div className="reports-card-header">
          <div><h3>Project Reports</h3><p>Export current data for projects available to your role.</p></div>
        </div>
        {reports.length === 0 ? <div className="empty-state"><FileText size={28} /><p>No project reports are available.</p></div> : reports.map((report) => (
          <div className="report-row" key={report.project._id}>
            <div className="report-icon"><FileText size={19} /></div>
            <div className="report-info">
              <strong>{report.project.name}</strong>
              <span>{report.totals.tasks} tasks · {report.totals.submissions} submissions</span>
            </div>
            <span className="report-type">Project</span>
            <span className="report-date">{new Date(report.project.updatedAt).toLocaleDateString()}</span>
            <button className="download-report" onClick={() => downloadReport(report)}>
              <Download size={15} /> Download
            </button>
          </div>
        ))}
      </div>

      <div className="report-analysis">
        <div className="analysis-card">
          <h3>Project Progress</h3>
          {reports.map((report) => <div className="analysis-progress" key={report.project._id}>
            <div><span>{report.project.name}</span><strong>{report.project.progress || 0}%</strong></div>
            <div className="progress-bar"><div className="progress-value" style={{ width: `${report.project.progress || 0}%` }} /></div>
          </div>)}
        </div>
        <div className="analysis-card">
          <h3>Task Overview</h3>
          <div className="task-overview-number"><strong>{allTasks.length}</strong><span>Total Tasks</span></div>
          <div className="task-overview-list">
            <div><span>Completed</span><strong>{completedTasks}</strong></div>
            <div><span>In Progress</span><strong>{allTasks.filter((task) => task.status === 'in_progress').length}</strong></div>
            <div><span>Pending</span><strong>{allTasks.filter((task) => task.status === 'todo').length}</strong></div>
            <div><span>Review</span><strong>{allTasks.filter((task) => task.status === 'in_review').length}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;