import {
  FileText,
  Search,
  Download,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Submissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [submissionResponse, projectResponse, taskResponse] = await Promise.all([
        api.get('/submissions'), api.get('/projects'), api.get('/tasks'),
      ]);
      setSubmissions(submissionResponse.data || []);
      setProjects(projectResponse.data || []);
      setTasks(taskResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Submissions could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([api.get('/submissions'), api.get('/projects'), api.get('/tasks')])
      .then(([submissionResponse, projectResponse, taskResponse]) => {
        setSubmissions(submissionResponse.data || []);
        setProjects(projectResponse.data || []);
        setTasks(taskResponse.data || []);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Submissions could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const createSubmission = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      await api.post('/submissions', formData);
      setShowForm(false);
      setProjectId('');
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Submission could not be uploaded.');
    }
  };

  const reviewSubmission = async (submissionId, reviewStatus) => {
    try {
      await api.patch(`/submissions/${submissionId}/review`, { reviewStatus });
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Submission review could not be saved.');
    }
  };

  const downloadFile = async (submission, index) => {
    try {
      const file = submission.files[index];
      const targetUrl = file.downloadUrl || `/api/files/${encodeURIComponent(file.fileName)}`;
      const response = await api.get(targetUrl, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'File could not be downloaded.');
    }
  };

  const visibleSubmissions = submissions.filter((submission) => {
    const text = `${submission.title} ${submission.project?.name || ''} ${submission.developer?.fullName || ''}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (statusFilter === 'all' || submission.reviewStatus === statusFilter);
  });

  const getStatusIcon = (status) => {
    if (status === 'Approved') {
      return <CheckCircle2 size={14} />;
    }

    if (status === 'Changes Required') {
      return <AlertCircle size={14} />;
    }

    return <Clock3 size={14} />;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Submissions</h1>
          <p>Review and manage project submissions.</p>
        </div>

        {user?.role === 'developer' && <button className="primary-button" onClick={() => setShowForm((visible) => !visible)}><Plus size={17} />New Submission</button>}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {showForm && <form className="entity-form" onSubmit={createSubmission}>
        <h3>Submit completed work</h3>
        <label>Project<select name="project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select></label>
        <label>Task<select name="task" required><option value="">Select task assigned to you</option>{tasks.filter((task) => (task.project?._id || task.project) === projectId && (task.assignee?._id || task.assignee) === user?._id).map((task) => <option key={task._id} value={task._id}>{task.title}</option>)}</select></label>
        <label>Title<input name="title" required maxLength={160} /></label>
        <label>Description<textarea name="description" rows="3" /></label>
        <label>Branch<input name="branchName" /></label>
        <label>Files<input name="files" type="file" multiple required accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.php,.rb,.sql,.html,.css,.json,.md,.zip" /></label>
        <button className="primary-button" type="submit">Upload submission</button>
      </form>}

      {/* SUMMARY */}

      <div className="submission-summary">

        <div className="submission-stat">
          <FileText size={20} />
          <div>
            <strong>{submissions.length}</strong>
            <span>Total Submissions</span>
          </div>
        </div>

        <div className="submission-stat">
          <Clock3 size={20} />
          <div>
            <strong>{submissions.filter((submission) => submission.reviewStatus === 'pending').length}</strong>
            <span>Pending Review</span>
          </div>
        </div>

        <div className="submission-stat">
          <CheckCircle2 size={20} />
          <div>
            <strong>{submissions.filter((submission) => submission.reviewStatus === 'approved').length}</strong>
            <span>Approved</span>
          </div>
        </div>

        <div className="submission-stat">
          <AlertCircle size={20} />
          <div>
            <strong>{submissions.filter((submission) => submission.reviewStatus === 'changes_requested').length}</strong>
            <span>Changes Required</span>
          </div>
        </div>

      </div>

      {/* SEARCH */}

      <div className="submission-toolbar">
        <div className="submission-search">
          <Search size={17} />
          <input
            type="text"
            placeholder="Search submissions..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select className="submission-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All Status</option>
          <option value="pending">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="changes_requested">Changes Required</option>
        </select>
      </div>

      {/* TABLE */}

      <div className="submission-table-card">

        <div className="submission-table">

          <div className="submission-row submission-header">
            <span>Submission</span>
            <span>Project</span>
            <span>Submitted By</span>
            <span>Date</span>
            <span>Status</span>
            <span>Action</span>
          </div>

          {loading ? <p>Loading submissions...</p> : visibleSubmissions.map((submission) => (

            <div
              className="submission-row"
              key={submission._id}
            >

              <div className="submission-name">
                <div className="file-icon">
                  <FileText size={18} />
                </div>

                <div>
                  <strong>{submission.title}</strong>
                  <span>{submission.files?.length || 0} file(s)</span>
                </div>
              </div>

              <span>{submission.project?.name || 'Project'}</span>

              <span>{submission.developer?.fullName || 'Developer'}</span>

              <span>{new Date(submission.createdAt).toLocaleDateString()}</span>

              <span>
                <span
                  className={`submission-status ${submission.reviewStatus === 'approved' ? 'approved' : submission.reviewStatus === 'changes_requested' ? 'changes' : 'pending'}`}
                >
                  {getStatusIcon(submission.reviewStatus === 'approved' ? 'Approved' : submission.reviewStatus === 'changes_requested' ? 'Changes Required' : 'Pending Review')}
                  {submission.reviewStatus?.replace('_', ' ') || 'Pending'}
                </span>
              </span>

              <div className="submission-actions">
                {(submission.files || []).map((file, index) => <button type="button" key={file.fileName} title={`Download ${file.fileName}`} onClick={() => downloadFile(submission, index)}><Download size={16} /></button>)}
                {['admin', 'project_manager'].includes(user?.role) && submission.reviewStatus === 'pending' && <>
                  <button type="button" title="Approve" onClick={() => reviewSubmission(submission._id, 'approved')}><CheckCircle2 size={16} /></button>
                  <button type="button" title="Request changes" onClick={() => reviewSubmission(submission._id, 'changes_requested')}><AlertCircle size={16} /></button>
                </>}
              </div>

            </div>

          ))}

        </div>

      </div>
    </div>
  );
}

export default Submissions;