
import pyttsx3
engine = pyttsx3.init()
engine.say("Welcome to the automated mail sender program. Please follow the instructions to send your email.")
engine.runAndWait()

# mail automation with python
import smtplib
from email.mime.text import MIMEText
from datetime import datetime
import time
sender_email = input("Enter senders mail address:")
password = input("Enter senders mail password:")
reciver_email = input("enter the reciver email: ")
DOB = input("enter your date of birth (dd-mm): ")
send_time = input("enter the time to send email (hh:mm): ")
print("waiting for the right time to send email...")
while True:
    now = datetime.now()
    current_time = now.strftime("%H:%M")
    current_date = now.strftime("%d-%m")
    if current_time == send_time and current_date == DOB:
        break
name = input("enter The Reciver's name: ")

# Enter your message here

msg = MIMEText(f"hello {name}, Enter your message here.")
msg["Subject"] = input("Enter your mail address subject:")
msg["From"] = sender_email
msg["To"] = reciver_email
try:
    server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
    server.login(sender_email, password)
    server.send_message(msg)
    server.quit() 
    print("email sent successfully") 
except Exception as e:
    print("failed to send email: ", e)
