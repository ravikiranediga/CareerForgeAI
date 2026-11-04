from datetime import datetime, timezone

APPLICATION_PROGRESS = {
    "Ready to apply": 10,
    "Applied": 20,
    "Screening": 42,
    "Assessment": 62,
    "Interview": 80,
    "Offer": 100,
    "Rejected": 100,
}
APPLICATION_NEXT_ACTION = {
    "Ready to apply": "Review and submit on employer site",
    "Applied": "HR screening",
    "Screening": "Technical review",
    "Assessment": "Complete assessment",
    "Interview": "Interview panel",
    "Offer": "Offer review",
    "Rejected": "No further action",
}


def serialize_job(row) -> dict:
    job = dict(row)
    job["skills"] = job["skills"].split(",") if job["skills"] else []
    job["type"] = job.pop("job_type")
    job["workMode"] = job.pop("work_mode")
    job["companyInfo"] = job.pop("company_info")
    job["responsibilities"] = [item for item in job["responsibilities"].split(";") if item]
    job["requirements"] = [item for item in job["requirements"].split(";") if item]
    job["benefits"] = [item for item in job["benefits"].split(";") if item]
    job["sourceName"] = job.pop("source", "Unknown")
    job["jobUrl"] = job.pop("job_url", "")
    job["listedAt"] = job.pop("listed_at", "")
    job["syncedAt"] = job.pop("synced_at", "")
    job.pop("external_id", None)
    job.pop("is_active", None)
    return job


def serialize_application(row) -> dict:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "company": row["company"],
        "role": row["title"],
        "date": datetime.fromisoformat(row["applied_at"]).astimezone(timezone.utc).strftime("%d %b %Y"),
        "status": row["status"],
        "action": APPLICATION_NEXT_ACTION[row["status"]],
        "progress": APPLICATION_PROGRESS[row["status"]],
        "resume_id": row["resume_id"],
        "resume_filename": row["resume_name"],
        "application_url": row["job_url"],
    }
