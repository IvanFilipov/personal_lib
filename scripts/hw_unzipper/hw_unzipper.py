#!/usr/bin/python3
# -*- coding: utf-8 -*-
""" A script for extracting homeworks
submitted to "Moodle educational system".
Mainly targeting "Introduction to programming"
course @ FMI, Sofia University 2019-2020.
"""

__author__     = "Ivan Filipov"
__version__    = "1.0.3"
__maintainer__ = "Ivan Filipov"
__email__      = "vanaka11.89@gmail.com"
__status__     = "Production"

import sys
import zipfile
import datetime
import os.path
import pickle
import re

from google_auth_oauthlib.flow      import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient                import discovery

USAGE = """usage: hw_unzipper.py hw_archive [out_dir]

positional arguments:
 hw_archive   zip file with all homeworks
              Notice: download it from Moodle.

optional arguments:
 out_dir      where to output the result
              Default: The output will be save in the same
                       directory from where the script has been run.
              Notice:  in this direcory a subdirectory
                       called <hw_num>_hw_<easy|hard>_check
                       will be created.
"""

# get read only access to google spreadsheets
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE       = "token.pickle"

SPREADSHEET_ID = "1CgFx73YgVE8uRnUVS2q3TUc5Kl_N18_zFTtvZVUGgqc"
NAMES_RANGE = "Sheet1!B205:B217"
DATES_RANGE = "Sheet1!D198:R198"
HW_RANGE    = "Sheet1!A4:R195"

MY_NAME = "Иван Филипов" # CHANGE ME
EASY_HW_BASE_OFFSET = 2
HARD_HW_BASE_OFFSET = 12

# ------------ Google spreadsheets related ------------

def setup_google_drive_credits():
    """Setup and save google account credits."""
    g_credits = None
    # The file token.pickle stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'rb') as token:
            g_credits = pickle.load(token)
    # If there are no (valid) credentials available, let the user log in.
    if not g_credits or not g_credits.valid:
        if g_credits and g_credits.expired and g_credits.refresh_token:
            g_credits.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE, SCOPES)
            g_credits = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open(TOKEN_FILE, 'wb') as token:
            pickle.dump(g_credits, token)

    return g_credits

def get_my_clr(sheet):
    """Get the color of the script runner."""
    result = sheet.get(spreadsheetId=SPREADSHEET_ID,
                       ranges=[NAMES_RANGE], includeGridData=True).execute()
    for user_cells in result["sheets"][0]["data"][0]["rowData"]:
        val = user_cells["values"][0]
        name = (val["userEnteredValue"]["stringValue"])
        if name == MY_NAME:
            return val["userEnteredFormat"]["backgroundColor"]

    print("Can't find", MY_NAME, ".\nMaybe you don't have rights to put marks?",\
           file=sys.stderr)
    sys.exit(4)

def get_students_ids_for_hw(my_clr, sheet, hw_num, hw_row_offset):
    """From the google spreadsheet, extract only student names and ids
       for those student the runner is interested into.
    """
    my_students = {}
    result = sheet.get(spreadsheetId=SPREADSHEET_ID,
                       ranges=[HW_RANGE], includeGridData=True).execute()
    for row in result["sheets"][0]["data"][0]["rowData"]:
        row_values = row["values"]
        hw_info = row_values[hw_row_offset + hw_num]
        try:
            hw_clr = hw_info["effectiveFormat"]["backgroundColor"]
        except:
            pass # empty cell, just skip it
        else:
            if hw_clr == my_clr:
                fn   = row_values[0]["formattedValue"]
                name = row_values[1]["formattedValue"]
                my_students[drop_mid_name(name)] = fn

    return my_students

def get_end_date(sheet, hw_num):
    """Extract the end datetime for that homework."""
    result = sheet.values().get(spreadsheetId=SPREADSHEET_ID, range=DATES_RANGE).execute()
    values = result.get('values')
    date_string = values[0][hw_num - 1]
    return datetime.datetime.strptime(date_string, "%d %m %Y, %H:%M")

def get_data_from_google_drive(hw_num, hw_row_offset):
    """Extract all required data from the google spreadsheet."""
    g_credits = setup_google_drive_credits()
    service = discovery.build('sheets', 'v4', credentials=g_credits)
    sheet = service.spreadsheets()
    clr = get_my_clr(sheet)
    return get_students_ids_for_hw(clr, sheet, hw_num, hw_row_offset),\
           get_end_date(sheet, hw_num)

# ------------ Zip file related ------------

def process_single_file(out_dir, zf, file_info, name, my_students, end_date):
    """From the archive process a single file.
       Decompress it and move it to the student's subdirectory.
    """
    # create the sub-dir
    names = name.split(" ")
    sub_dir_name = os.path.join(out_dir, my_students[name] + "_" +
                                names[0] + "_" + names[1])
    ensure_dir_exists(sub_dir_name)
    # extract the file
    file_name = file_info.filename.split("_assignsubmission_file_")[-1]
    if file_name.startswith('/') or file_name.startswith("\\"):
        file_name = file_name[1:]
    full_file_name = os.path.join(sub_dir_name, file_name)
    with open(full_file_name, "wb") as out_file:
        out_file.write(zf.read(file_info.filename))

    # check end time
    mod_date = datetime.datetime(*file_info.date_time)
    if mod_date > end_date:
        flag_file_name = os.path.join(sub_dir_name, "flags.txt")
        late_with = (mod_date - end_date).seconds // 60
        with open(flag_file_name, "a") as out_file:
            flag_string = file_name + " was submitted after the due datetime. " +\
                          "Late with %d minutes\n" % late_with
            out_file.write(flag_string)

def process_zip_file(filename, my_students, end_date, out_dir):
    """From the given zip file, extract the info the runner needs."""
    with zipfile.ZipFile(filename, 'r') as zip_file:
        for info in zip_file.infolist():
            name = info.filename.split("_")[0]
            if name not in my_students:
                continue
            process_single_file(out_dir, zip_file, info, name, my_students, end_date)

# ------------ Minor helpers ------------

def drop_mid_name(name):
    """Get only first and last name of a student."""
    names = name.split(" ")
    return names[0] + ' ' + names[2]

def ensure_dir_exists(dir_name):
    """Create a directory if it is not existing."""
    if not os.path.exists(dir_name):
        os.mkdir(dir_name)

def get_hw_num_and_type_from_zip_name(zip_file_name):
    """Determinate homework number and it's type
       from the zip file name.
    """
    try:
        file_name = zip_file_name.lower()
        is_easy = "леко" in file_name
        hw_num  = int(re.search(r"C*(\d+)-\d+.zip", zip_file_name).group(1))
    except:
        print(zip_file_name + " does not look like moodle's zip file.", file=sys.stderr)
        sys.exit(3)
    else:
        return (hw_num, is_easy)

def format_output_dir_name(out_dir_name_root, hw_num, is_easy):
    """Create subdirectory name from given homework number and type."""
    type_string = "easy" if is_easy else "hard"
    formatted_subdir = "%02d_hw_%s_check" % (hw_num, type_string) # modify as you wish :)
    return os.path.join(out_dir_name_root, formatted_subdir)

def main(args):
    """Well, a simple C/C++ style main function."""
    if len(args) < 2:
        print(USAGE, file=sys.stderr)
        sys.exit(1)
    # parse arguments
    zip_file_name = args[1]
    if not zipfile.is_zipfile(zip_file_name):
        print(zip_file_name + " is not a valid .zip file.", file=sys.stderr)
        sys.exit(2)

    out_dir_name_root = args[2] if len(args) > 2 else "./"
    ensure_dir_exists(out_dir_name_root)

    # extract info and prepare output direcory
    hw_num, is_easy = get_hw_num_and_type_from_zip_name(zip_file_name)
    out_dir = format_output_dir_name(out_dir_name_root, hw_num, is_easy)
    ensure_dir_exists(out_dir)
    hw_row_offset = EASY_HW_BASE_OFFSET if is_easy else HARD_HW_BASE_OFFSET

    # get the needed info from google spreadsheets and decompress wanted files
    my_students, end_date = get_data_from_google_drive(hw_num, hw_row_offset)
    process_zip_file(zip_file_name, my_students, end_date, out_dir)

if __name__ == '__main__':
    main(sys.argv)
