from ...schema import db

def load_all_projects(format):
    query = """
        SELECT 
            Project.*,
            ProjectConfig.*
        FROM 
            Project
        JOIN 
            ProjectConfig 
        ON 
            ProjectConfig.projectId = Project.id;
    """

    db.execute(query)
    # results = db.fetchall()
    # print(results)