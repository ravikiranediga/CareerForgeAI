import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../../services/api'

const profileSections = [
  ['Education', 'education', 'Enter your education'],
  ['Skills', 'skills', 'Separate skills with commas'],
  ['Experience', 'experience', 'Add roles or internships, separated by commas'],
  ['Projects', 'projects', 'Add project names, separated by commas'],
  ['Certifications', 'certifications', 'Add certifications, separated by commas'],
  ['Languages', 'languages', 'Add languages, separated by commas'],
]

export function ResumeOnboarding({ token, onUploaded }) {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [geminiConsent, setGeminiConsent] = useState(false)

  const submitResume = async (event) => {
    event.preventDefault()
    if (!file) {
      setError('Choose a PDF or DOCX resume to continue.')
      return
    }

    setBusy(true)
    setError('')
    const formData = new FormData()
    formData.set('file', file)
    formData.set('gemini_consent', String(geminiConsent))
    try {
      const profile = await apiRequest('/profile/resume', {
        method: 'POST',
        token,
        body: formData,
      })
      await onUploaded(profile)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <div className="brand-mark">C</div>
        <p className="eyebrow">First step</p>
        <h1>Start with your resume</h1>
        <p>Upload a PDF or DOCX. CareerForge extracts the text locally, then sends that text to Google Gemini to analyze the resume and fill your profile.</p>
        <form className="resume-upload-form" onSubmit={submitResume}>
          <label className="upload-dropzone">
            <span className="upload-icon">↑</span>
            <strong>{file ? file.name : 'Choose your resume'}</strong>
            <span>PDF or DOCX · up to 8 MB</span>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setGeminiConsent(false)
                setError('')
              }}
            />
          </label>
          <label className="consent-checkbox">
            <input
              aria-label="Consent to send resume to Google Gemini for analysis"
              type="checkbox"
              checked={geminiConsent}
              onChange={(event) => setGeminiConsent(event.target.checked)}
            />
            <span>I agree to send the extracted text of this resume, which may contain personal information, to Google Gemini for analysis. The original file is not sent to Gemini.</span>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="primary-btn auth-submit" disabled={busy || !file || !geminiConsent}>
            {busy ? 'Reading resume…' : 'Upload and analyze resume'}
          </button>
        </form>
        <p className="upload-privacy">Your original file stays in this app's storage. If Gemini is unavailable, CareerForge will fall back to local text extraction and clearly say so.</p>
      </section>
    </main>
  )
}

export function ProfilePage({ profile, setProfile, token, setToast }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [geminiConsent, setGeminiConsent] = useState(false)
  const [newResumeFile, setNewResumeFile] = useState(null)
  const [uploadConsent, setUploadConsent] = useState(false)
  const [uploadingResume, setUploadingResume] = useState(false)
  const values = draft ?? profile.profile ?? {}
  const currentProfile = profile.profile ?? {}

  const beginEditing = () => {
    setDraft({
      ...currentProfile,
      skills: (currentProfile.skills ?? []).join(', '),
      experience: (currentProfile.experience ?? []).join('\n'),
      projects: (currentProfile.projects ?? []).join('\n'),
      certifications: (currentProfile.certifications ?? []).join('\n'),
      languages: (currentProfile.languages ?? []).join(', '),
      preferred_roles: (currentProfile.preferred_roles ?? []).join(', '),
    })
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = { ...draft }
      for (const [, key] of profileSections) {
        if (key !== 'education') {
          const separator = ['experience', 'projects', 'certifications'].includes(key) ? /\r?\n/ : ','
          payload[key] = (draft[key] ?? '').split(separator).map((item) => item.trim()).filter(Boolean)
        }
      }
      payload.preferred_roles = (draft.preferred_roles ?? '').split(',').map((item) => item.trim()).filter(Boolean)
      const updated = await apiRequest('/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      })
      setProfile(updated)
      setDraft(null)
      setToast('Profile details saved.')
    } catch (error) {
      setToast(error.message)
    } finally {
      setSaving(false)
    }
  }

  const downloadResume = async (resume = profile.resume) => {
    if (!resume) return
    try {
      const response = await fetch(resume.download_url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Unable to download your resume.')
      const blobUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = resume.filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (error) {
      setToast(error.message)
    }
  }

  const uploadAnotherResume = async (event) => {
    event.preventDefault()
    if (!newResumeFile || !uploadConsent) return
    const form = event.currentTarget
    setUploadingResume(true)
    const formData = new FormData()
    formData.set('file', newResumeFile)
    formData.set('gemini_consent', 'true')
    try {
      const updated = await apiRequest('/profile/resume', {
        method: 'POST',
        token,
        body: formData,
      })
      setProfile(updated)
      setNewResumeFile(null)
      setUploadConsent(false)
      form.reset()
      setToast(`Resume uploaded securely. ${updated.analysis_notice ?? ''}`)
    } catch (error) {
      setToast(error.message)
    } finally {
      setUploadingResume(false)
    }
  }

  const reanalyzeResume = async () => {
    setReanalyzing(true)
    try {
      const updated = await apiRequest(`/profile/resumes/${profile.resume.id}/reanalyze`, {
        method: 'POST',
        token,
        body: JSON.stringify({ gemini_consent: geminiConsent }),
      })
      setProfile(updated)
      setGeminiConsent(false)
      setToast(`Resume re-analyzed. ${updated.analysis_notice ?? 'Review the extracted profile details.'}`)
    } catch (error) {
      setToast(error.message)
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <div className="page-panel">
      <div className="panel-header split-header">
        <div>
          <h2>My Profile</h2>
          <p>Details are extracted from your resume. Review and correct anything that needs updating.</p>
        </div>
        {!draft && <button type="button" className="primary-btn" onClick={beginEditing}>Edit profile</button>}
      </div>
      <div className="resume-profile-summary">
        <div className="resume-score-card">
          <span>Profile completion</span>
          <strong>{profile.profile_completion}%</strong>
          <div className="progress-bar"><span style={{ width: `${profile.profile_completion}%` }} /></div>
          <small>Based on information available in your resume profile.</small>
        </div>
        {profile.resume && (
          <div className="resume-file-card">
            <span className="resume-file-icon">{profile.resume.filename.split('.').pop()?.toUpperCase() ?? 'FILE'}</span>
            <div>
              <strong>{profile.resume.filename}</strong>
              <span>Uploaded {profile.resume.uploaded_at ? new Date(profile.resume.uploaded_at).toLocaleDateString() : ''}</span>
              <span>Resume section coverage: {profile.resume.section_coverage}/100</span>
            </div>
            <div className="resume-file-actions">
              <label className="consent-checkbox">
                <input
                  aria-label="Consent to send resume to Google Gemini for analysis"
                  type="checkbox"
                  checked={geminiConsent}
                  onChange={(event) => setGeminiConsent(event.target.checked)}
                  disabled={reanalyzing}
                />
                <span>Send extracted resume text to Google Gemini for analysis</span>
              </label>
              <button type="button" className="secondary-btn" onClick={reanalyzeResume} disabled={reanalyzing || !geminiConsent}>
                {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
              </button>
              <button type="button" className="secondary-btn" onClick={() => downloadResume()}>Download original</button>
            </div>
          </div>
        )}
      </div>
      <section className="saved-resumes-section">
        <div className="panel-header">
          <div>
            <h3>Your saved resumes</h3>
            <p>Only you can access these files. Choose one when preparing an application.</p>
          </div>
        </div>
        {(profile.resumes ?? []).filter((resume) => !resume.is_current).map((resume) => (
          <div className="saved-resume-row" key={resume.id}>
            <div>
              <strong>{resume.filename}</strong>
              <span>Uploaded {resume.uploaded_at ? new Date(resume.uploaded_at).toLocaleDateString() : ''}</span>
            </div>
            <button type="button" className="secondary-btn" onClick={() => downloadResume(resume)}>Download</button>
          </div>
        ))}
        {(profile.resumes ?? []).filter((resume) => !resume.is_current).length === 0 && (
          <p className="empty-panel-copy">No previous resumes saved yet.</p>
        )}
        <form className="resume-upload-form additional-resume-form" onSubmit={uploadAnotherResume}>
          <label>
            Upload another resume (PDF or DOCX, up to 8 MB)
            <input
              aria-label="Upload another resume"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                setNewResumeFile(event.target.files?.[0] ?? null)
                setUploadConsent(false)
              }}
            />
          </label>
          {newResumeFile && <span>Selected: {newResumeFile.name}</span>}
          <label className="consent-checkbox">
            <input
              aria-label="Consent to send new resume text to Google Gemini for analysis"
              type="checkbox"
              checked={uploadConsent}
              onChange={(event) => setUploadConsent(event.target.checked)}
            />
            <span>I agree to send the extracted text of this resume to Google Gemini for profile analysis. The original file is not sent to Gemini.</span>
          </label>
          <button type="submit" className="secondary-btn" disabled={!newResumeFile || !uploadConsent || uploadingResume}>
            {uploadingResume ? 'Uploading…' : 'Upload and save resume'}
          </button>
        </form>
      </section>
      {draft ? (
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <div className="profile-edit-grid">
            <label>Full name<input required value={values.full_name ?? ''} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
            <label>Email<input type="email" value={values.email ?? profile.email} readOnly /></label>
            <label>Phone<input value={values.phone ?? ''} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label>Location<input value={values.location ?? ''} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
            <label className="full-width-field">Professional headline<input value={values.headline ?? ''} onChange={(event) => setDraft({ ...draft, headline: event.target.value })} /></label>
            <label className="full-width-field">Professional summary<textarea rows={4} maxLength={3000} value={values.summary ?? ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Summarize your strengths and relevant experience using accurate, specific details." /></label>
            {profileSections.map(([label, key, placeholder]) => (
              <label className="full-width-field" key={key}>
                {label}
                <textarea
                  rows={key === 'education' ? 2 : 3}
                  placeholder={placeholder}
                  value={Array.isArray(values[key]) ? values[key].join(', ') : values[key] ?? ''}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="full-width-field">Preferred roles<input value={values.preferred_roles ?? ''} onChange={(event) => setDraft({ ...draft, preferred_roles: event.target.value })} placeholder="Separate roles with commas" /></label>
          </div>
          <div className="module-actions">
            <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            <button type="button" className="secondary-btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="profile-details-grid">
          <ProfileDetail label="Name" value={currentProfile.full_name || profile.name} />
          <ProfileDetail label="Email" value={currentProfile.email || profile.email} />
          <ProfileDetail label="Phone" value={currentProfile.phone} />
          <ProfileDetail label="Location" value={currentProfile.location} />
          <ProfileDetail label="Professional headline" value={currentProfile.headline} />
          <ProfileDetail label="Professional summary" value={currentProfile.summary} fullWidth />
          {profileSections.map(([label, key]) => (
            <ProfileDetail key={key} label={label} value={currentProfile[key]} fullWidth={key === 'education'} />
          ))}
          <ProfileDetail label="Preferred roles" value={currentProfile.preferred_roles} />
        </div>
      )}
      <p className="profile-extraction-note">Text extraction may miss information in image-based or highly designed resumes. Please review extracted fields before using them.</p>
    </div>
  )
}

function ProfileDetail({ label, value, fullWidth = false }) {
  const display = Array.isArray(value) ? value.join(', ') : value
  return (
    <div className={`profile-detail${fullWidth ? ' full-width-field' : ''}`}>
      <span>{label}</span>
      <strong>{display || 'Not found in the resume yet'}</strong>
    </div>
  )
}

export function ResumeBuilderPage({ profile, user, token, setProfile, setToast }) {
  const [template, setTemplate] = useState('classic')
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const details = draft ?? profile.profile ?? {}
  const listToText = (value, separator = '\n') => Array.isArray(value) ? value.join(separator) : value ?? ''
  const listFromText = (value, separator = /\r?\n/) => value.split(separator).map((item) => item.trim()).filter(Boolean)
  const beginEditing = () => {
    const current = profile.profile ?? {}
    setDraft({
      ...current,
      skills: listToText(current.skills, ', '),
      experience: listToText(current.experience),
      projects: listToText(current.projects),
      certifications: listToText(current.certifications),
      languages: listToText(current.languages, ', '),
      preferred_roles: listToText(current.preferred_roles, ', '),
    })
  }
  const saveDetails = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = { ...draft }
      for (const key of ['experience', 'projects', 'certifications']) payload[key] = listFromText(draft[key] ?? '')
      payload.skills = listFromText(draft.skills ?? '', ',')
      payload.languages = listFromText(draft.languages ?? '', ',')
      payload.preferred_roles = listFromText(draft.preferred_roles ?? '', ',')
      const updated = await apiRequest('/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      })
      setProfile(updated)
      setDraft(null)
      setToast('Resume details saved.')
    } catch (error) {
      setToast(error.message)
    } finally {
      setSaving(false)
    }
  }
  const printResume = () => {
    window.print()
    setToast('Choose “Save as PDF” in the print dialog to download your resume.')
  }

  return (
    <div className="page-panel resume-builder-page">
      <div className="panel-header split-header no-print">
        <div>
          <h2>Resume Builder</h2>
          <p>Add your own details, review the live preview, then print or save it as a PDF.</p>
        </div>
        <div className="module-actions">
          {!draft && <button type="button" className="primary-btn" onClick={beginEditing}>Add or edit details</button>}
          <label className="template-picker">
            Template
            <select value={template} onChange={(event) => setTemplate(event.target.value)}>
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>
      </div>
      {draft && (
        <form className="profile-edit-form no-print" onSubmit={saveDetails}>
          <div className="profile-edit-grid">
            <label>Full name<input required maxLength={100} value={draft.full_name ?? user.name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
            <label>Email<input type="email" value={draft.email ?? profile.email ?? user.email} readOnly /></label>
            <label>Phone<input maxLength={40} value={draft.phone ?? ''} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label>Location<input maxLength={120} value={draft.location ?? ''} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
            <label className="full-width-field">Professional headline<input maxLength={200} value={draft.headline ?? ''} onChange={(event) => setDraft({ ...draft, headline: event.target.value })} placeholder="Role or professional focus" /></label>
            <label className="full-width-field">Professional summary<textarea rows={4} maxLength={3000} value={draft.summary ?? ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Use accurate details; focus on your strengths, tools, and relevant experience." /></label>
            <label className="full-width-field">Education<textarea rows={3} maxLength={1000} value={draft.education ?? ''} onChange={(event) => setDraft({ ...draft, education: event.target.value })} placeholder="Degree, institution, dates, and relevant details" /></label>
            <label className="full-width-field">Skills<textarea rows={2} value={draft.skills ?? ''} onChange={(event) => setDraft({ ...draft, skills: event.target.value })} placeholder="Separate skills with commas" /></label>
            <label className="full-width-field">Experience<textarea rows={4} value={draft.experience ?? ''} onChange={(event) => setDraft({ ...draft, experience: event.target.value })} placeholder="One role or achievement per line; include action, tools, and measurable results where accurate" /></label>
            <label className="full-width-field">Projects<textarea rows={4} value={draft.projects ?? ''} onChange={(event) => setDraft({ ...draft, projects: event.target.value })} placeholder="One project or contribution per line" /></label>
            <label className="full-width-field">Certifications<textarea rows={2} value={draft.certifications ?? ''} onChange={(event) => setDraft({ ...draft, certifications: event.target.value })} placeholder="One certification per line" /></label>
            <label>Languages<input value={draft.languages ?? ''} onChange={(event) => setDraft({ ...draft, languages: event.target.value })} placeholder="Comma-separated" /></label>
            <label>Preferred roles<input value={draft.preferred_roles ?? ''} onChange={(event) => setDraft({ ...draft, preferred_roles: event.target.value })} placeholder="Comma-separated" /></label>
          </div>
          <p className="profile-extraction-note">Only include information you can verify. Each experience, project, or certification line becomes a separate resume item.</p>
          <div className="module-actions">
            <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save resume details'}</button>
            <button type="button" className="secondary-btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="resume-builder-summary no-print">
        <div className="resume-score-card">
          <span>Resume section coverage</span>
          <strong>{profile.resume?.section_coverage ?? 0}/100</strong>
          <div className="progress-bar"><span style={{ width: `${profile.resume?.section_coverage ?? 0}%` }} /></div>
          <small>Counts six populated sections. It does not test ATS parsing or predict hiring outcomes.</small>
        </div>
        <div className="card-panel resume-suggestions">
          <h3>Checklist</h3>
          <ul className="mini-list">
            {['Professional headline', 'Education', 'Skills', 'Experience', 'Projects', 'Certifications'].map((section) => (
              <li key={section}><span className={`dot ${sectionPresent(section, details) ? 'green' : 'orange'}`} />{section}{sectionPresent(section, details) ? ' included' : ' not found'}</li>
            ))}
          </ul>
        </div>
      </div>
      <article className={`resume-document resume-template-${template}`} id="resume-document">
        <header className="resume-document-header">
          <h1>{details.full_name || user.name}</h1>
          {details.headline && <p>{details.headline}</p>}
          <div>{[details.email || profile.email || user.email, details.phone, details.location].filter(Boolean).join(' · ')}</div>
        </header>
        {[
          ['Summary', details.summary],
          ['Education', details.education],
          ['Skills', details.skills],
          ['Experience', details.experience],
          ['Projects', details.projects],
          ['Certifications', details.certifications],
          ['Languages', details.languages],
        ].map(([title, content]) => content && (
          <section className="resume-document-section" key={title}>
            <h2>{title}</h2>
            {Array.isArray(content) || ['Experience', 'Projects', 'Certifications'].includes(title) ? (
              <ul className="resume-document-list">
                {(Array.isArray(content) ? content : listFromText(content)).map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
              </ul>
            ) : <p>{content}</p>}
          </section>
        ))}
        {!profile.resume && !details.summary && !details.education && !details.skills?.length && <p>Start by entering your details above to build your resume.</p>}
      </article>
      <div className="module-actions no-print">
        <button type="button" className="primary-btn" onClick={printResume}>Download as PDF</button>
        <span className="profile-extraction-note">Your browser's print dialog can save this page as a PDF.</span>
      </div>
    </div>
  )
}

function sectionPresent(section, details) {
  const fields = {
    'Professional headline': Boolean(details.headline),
    Education: Boolean(details.education),
    Skills: Boolean(details.skills?.length),
    Experience: Boolean(details.experience?.length),
    Projects: Boolean(details.projects?.length),
    Certifications: Boolean(details.certifications?.length),
  }
  return fields[section]
}
