CAREERS = {
 "data_analyst": {"name":"Data Analyst","skills":[
  {"id":"sql","name":"SQL","core":True},{"id":"excel","name":"Excel","core":True},
  {"id":"python","name":"Python","core":True},{"id":"data_viz","name":"Data Visualization","core":True},
  {"id":"statistics","name":"Statistics","core":False}]},
 "software_engineer": {"name":"Software Engineer","skills":[
  {"id":"programming","name":"Programming","core":True},{"id":"git","name":"Git & Version Control","core":True},
  {"id":"testing","name":"Software Testing","core":True},{"id":"databases","name":"Databases","core":True},
  {"id":"systems","name":"System Design","core":False}]},
 "ux_designer": {"name":"UX Designer","skills":[
  {"id":"research","name":"User Research","core":True},{"id":"wireframing","name":"Wireframing","core":True},
  {"id":"prototyping","name":"Prototyping","core":True},{"id":"usability","name":"Usability Testing","core":True}]},
 "cybersecurity": {"name":"Cybersecurity Analyst","skills":[
  {"id":"networking","name":"Networking","core":True},{"id":"security","name":"Security Fundamentals","core":True},
  {"id":"linux","name":"Linux","core":True},{"id":"incident","name":"Incident Response","core":True}]}
}
MOVES = [
 {"id":"sql-dashboard","title":"Build a SQL analytics dashboard","type":"create","skill":"sql","difficulty":"moderate","description":"Query a public dataset and document three useful insights.","points":20},
 {"id":"excel-clean","title":"Clean and analyze a spreadsheet","type":"test","skill":"excel","difficulty":"easy","description":"Use formulas, validation, and a short quality checklist.","points":20},
 {"id":"python-notebook","title":"Create a Python analysis notebook","type":"create","skill":"python","difficulty":"hard","description":"Explore a dataset, explain your approach, and communicate findings.","points":20},
 {"id":"viz-story","title":"Tell a story with a visualization","type":"share","skill":"data_viz","difficulty":"moderate","description":"Create a chart and explain the audience, insight, and design choices.","points":15},
 {"id":"sql-explore","title":"Explore a new SQL technique","type":"explore","skill":"sql","difficulty":"easy","description":"Learn a technique and show a small example of using it.","points":10},
 {"id":"peer-connect","title":"Connect with a data community","type":"connect","skill":"statistics","difficulty":"easy","description":"Summarize one useful discussion or learning resource.","points":10},
 {"id":"learning-enable","title":"Complete a focused learning module","type":"enable","skill":"python","difficulty":"moderate","description":"Complete a short lesson and apply the concept in a small exercise.","points":10}
]
OPPORTUNITIES = [
 {"id":"study-group","name":"Peer study group","tier":"Familiar","fulfillment":"real","description":"Join a skill-focused peer study group."},
 {"id":"peer-reviewer","name":"Peer Reviewer role","tier":"Proficient","fulfillment":"real","description":"Become eligible to review evidence for this skill."},
 {"id":"mentor-match","name":"Mentor match","tier":"Proficient","fulfillment":"seeded","description":"Browse seeded mentor profiles."},
 {"id":"recruiter-visibility","name":"Recruiter visibility","tier":"Demonstrated","fulfillment":"flag","description":"Your profile is marked as eligible for recruiter visibility."},
 {"id":"partner-brief","name":"Partner project brief","tier":"Demonstrated","fulfillment":"seeded","description":"Explore a seeded partner project brief."},
 {"id":"ieee-nomination","name":"IEEE nomination","tier":"Verified","fulfillment":"display","description":"Verified-tier recognition preview."},
 {"id":"ieee-certificate","name":"IEEE co-signed certificate","tier":"Verified","fulfillment":"display","description":"Certificate eligibility display."}
]
