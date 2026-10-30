"""Rebuild offline similarity groups from the existing official question bank.

Only writes assets/similarity-data.js. Official questions and answer keys are read-only.
Curated concept groups are followed by strict TF-IDF bigram comparisons and meaningful
identical-answer groups. No generic 'all of the above', A/B-combination, or numeric-only
answer buckets are generated.
"""
import collections
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser(description="Rebuild offline similarity groups from index.html")
parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="Repository root; defaults to the parent of scripts/")
ROOT = parser.parse_args().root.resolve()
source = (ROOT / "index.html").read_text(encoding="utf-8")
questions = json.loads(re.search(r"const QUESTIONS=(\[.*?\]);", source).group(1))

def clean(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))

for q in questions:
    matches = list(re.finditer(r"\(([1-4])\)\s*", q["text"]))
    q["prompt"] = q["text"][:matches[0].start()].strip()
    q["options"] = [q["text"][m.end():matches[i+1].start() if i < 3 else len(q["text"])].strip() for i, m in enumerate(matches[:4])]
    q["correct"] = clean(q["options"][q["answer"] - 1])
by_id = {q["id"]: q for q in questions}
groups = []

def ids(numbers, section="金融市場常識"):
    return [f"{section}-{number:03d}" for number in numbers]

def add(key, kind, title, description, question_ids, terms=None, contrasts=None):
    question_ids = list(dict.fromkeys(question_ids))
    assert len(question_ids) >= 2, key
    assert all(qid in by_id for qid in question_ids), key
    group = dict(id=key, kind=kind, title=title, description=description, questionIds=question_ids)
    if terms:
        group["terms"] = terms
    if contrasts:
        group["contrasts"] = [dict(term=t, clue=c) for t, c in contrasts]
    groups.append(group)

# The first groups explicitly address the user's examples and the opening 20 questions.
market_contrasts = [
    ("初級／發行市場", "看是否在發行新證券；第 108 題以企業現金增資為例，第 361 題配對初級與發行市場。"),
    ("次級／流通市場", "看是否買賣已發行流通的證券；第 15 題答案是次級市場。"),
    ("貨幣市場", "看短期資金融通；第 19 題的『短期』與第 338 題的『一年期以內』是線索。"),
    ("資本市場", "看中、長期證券；第 20 題的『中、長期』與第 17 題的『公司債』是線索。"),
    ("集中／店頭市場", "看交易組織方式；第 50 題是集中場所撮合，第 51 題是分散地點的交易商報價。"),
]
market_names = {name + "市場" for name in ["發行", "初級", "次級", "流通", "貨幣", "資本", "短期資金", "短期", "長期", "同業拆款", "拆款", "芝加哥商品", "長期外匯", "集中", "自營商交易", "店頭", "股票", "公債", "公司債", "商業本票", "票券", "債券", "基金", "期貨", "現貨", "地方性金融", "國內性金融", "國際性金融", "公債發行前期交易", "集中交易", "櫃檯", "外匯", "即期外匯", "遠期外匯", "外匯期貨", "國際資本"]}
def is_market_name_option(option):
    option = re.sub(r"\([^)]*\)", "", clean(option))
    components = re.split(r"[和與及、／/]", option)
    return bool(components) and all(component in market_names for component in components)
market_name_questions = [q["id"] for q in questions if sum(is_market_name_option(option) for option in q["options"]) >= 2]
add("answers-markets", "answers", "各種市場：名稱相似，分類依據不同", "只收錄至少兩個短選項為『XX 市場』名稱的題目。包含第 15、17、19、20 題；即使題幹不同，這些市場名稱仍容易混淆。先看發行流通、資金期限或交易方式。", market_name_questions, ["市場", "發行", "流通", "短期", "長期", "期限"], market_contrasts)
add("answers-authorities", "answers", "機關名稱：金管會、各局與中央銀行", "前 7–12 題容易把主管機關、所屬監理局、檢查單位與受監理機構混在一起；本群僅比較機關／機構名稱選項，逐題核對對象與問法。", ids([7,8,9,10,11,12,64,193,259,341,365]), ["金融監督管理委員會", "銀行局", "保險局", "證券期貨局", "檢查局", "中央銀行"], [("金融監督管理委員會", "第 7 題問銀行、票券、證券及保險等機構的主管機關；第 193 題問期貨市場主管機關。"), ("證券期貨局", "第 8 題問證券相關事業的監理單位。"), ("檢查局", "第 9 題問金融業檢查業務。"), ("中央銀行", "第 259 題問發行通貨、執行貨幣政策；第 341 題問貨幣市場最後調節者。")])
add("questions-primary-secondary", "questions", "新發行還是已流通？初級與次級市場", "都在問證券發行／流通的區分；第 14、34 題採否定問法，第 15、108、361 題採直接辨認。", ids([14,15,34,108,361]), ["發行", "流通", "次級市場", "初級市場", "現金增資"], market_contrasts[:2])
add("questions-money-capital", "questions", "短期還是中長期？貨幣與資本市場", "第 16、17、19、20 題連續比較期限與商品。公司債、短期融通、中長期證券看似都在問市場，但判斷線索不同。", ids([16,17,19,20,41,43,44,46,47,338,339]), ["短期", "長期", "期限", "公司債", "貨幣市場", "資本市場"], market_contrasts[2:4])
add("questions-supervision-roles", "questions", "主管機關、監理單位、檢查單位怎麼分？", "前 7–12 題共同檢查監理架構。第 7–9 題問機關職掌，第 10–12 題改問『非隸屬／不屬／不是』。", ids([7,8,9,10,11,12]), ["主管機關", "監理", "檢查", "非隸屬", "不屬", "不是"], [("第 7 題", "整體主管機關：金融監督管理委員會。"), ("第 8 題", "證券相關事業監理：證券期貨局。"), ("第 9 題", "金融業檢查業務：檢查局。"), ("第 10–12 題", "問不符合的機關或機構，答案不能直接套用前 3 題。")])
add("questions-financial-functions", "questions", "金融市場的功能：正問與反問", "第 1、39 題問『不是』主要功能，第 53 題問包含哪些功能。", ids([1,39,53]), ["功能", "不是", "投機"])
add("questions-direct-indirect", "questions", "發行證券或經銀行融通？直接與間接金融", "同樣問資金融通，分清資金需求者直接發行證券與經金融中介移轉資金的敘述。", ids([18,40,52,58,59,351]), ["直接金融", "間接金融", "發行證券", "金融機構"], [("直接金融", "第 18、59 題以資金需求者發行證券為線索。"), ("間接金融", "第 52、58 題以金融機構取得資金再貸放為線索；第 351 題以向銀行借款為例。")])

# Answer families require short, concrete alternatives rather than whole topic matches.
family_specs = [
    ("risks", "風險名稱：流動性、信用、利率與營運", r"(?:流動性|信用|利率|市場|營運|作業|法律|購買力|匯率)風險", ["流動性風險", "信用風險", "利率風險", "營運風險"], [("流動性風險", "第 102、264 題看變現能力與資金需求。"), ("信用風險", "第 265 題看借款人或交易對手違約。"), ("營運風險", "第 269 題看人為疏失、舞弊與資訊系統操作。"), ("利率風險", "第 270 題以利率敏感性缺口為線索。")]),
    ("trust-types", "信託名稱：財產種類相似，標的不同", r"(?:動產|不動產|金錢|金錢債權|有價證券|租賃權|專利權|地上權|人格權|商譽)信託", ["動產信託", "不動產信託", "金錢債權信託", "有價證券信託", "租賃權信託"], [("動產信託", "第 310 題的標的是船舶。"), ("不動產信託", "第 311 題的標的是土地。"), ("金錢債權信託", "第 312 題的標的是以給付一定金額為內容的債權。"), ("有價證券信託", "第 313 題的標的是股票。"), ("租賃權信託", "第 319 題的標的是租賃權。")]),
    ("bills", "票券名稱：匯票、本票與承兌人", r"(?:銀行承兌匯票|商業承兌匯票|匯票|本票|交易性商業本票|融資性商業本票|國庫券|可轉讓定期存單)", ["匯票", "本票", "銀行承兌", "商業承兌"], [("匯票／本票", "第 345 題是委託付款人支付；第 348 題是發票人自己支付。"), ("銀行／商業承兌匯票", "第 346、347 題比較付款人是否為銀行。")]),
    ("ethics-principles", "原則名稱：保密、公開、專業、誠信與保險原則", r"原則$", ["保密原則", "資訊公開原則", "專業原則", "善良管理原則", "最大誠信原則", "利益衝突原則"], [("保密原則", "第 447、459、462 題看客戶資料與隱私的保管。"), ("資訊公開原則", "第 217、218、222 題看充足資訊與投資風險告知。"), ("專業原則", "第 138 題看維持必要知識及技能；第 173 題看分析判斷的依據。"), ("善良管理原則", "第 139 題以辦理客戶資產或財物保管為線索。"), ("最大誠信原則", "第 261、262 題看保險的據實說明、告知、通知與保證。")]),
    ("insurance-parties", "保險角色：要保人、保險人與受益人", r"(?:要保人|保險人|被保險人|受益人)", ["要保人", "保險人", "被保險人", "受益人"], [("契約當事人", "第 398 題答案為要保人與保險人。"), ("契約關係人", "第 400 題答案為被保險人與受益人。")]),
    ("insurance-types", "保險名稱：財產、人身、年金與定額", r"(?:財產|人身|人壽|定額|定值|傷害|健康|年金|生存|死亡|信用|責任|火災|汽車)保險", ["財產保險", "人身保險", "定額保險", "年金保險"], None),
    ("risk-management", "風險管理方法：避免、自留、預防與抑制", r"(?:風險避免|風險自留|風險移轉|損失預防|損失抑制|損失抑減)", ["風險避免", "風險自留", "損失預防", "損失抑制"], [("保險", "第 390 題看損失頻率小、幅度大的情況。"), ("風險自留", "第 391 題看幅度不大、損失成本較能估計。"), ("風險避免", "第 392 題問完全將發生頻率降為零。"), ("損失預防", "第 393 題問降低損失發生頻率。")]),
    ("exchange", "外匯名稱：即期、遠期與匯率", r"(?:即期外匯市場|遠期外匯市場|換匯市場|交叉匯率|換匯匯率|即期匯率|遠期匯率)", ["即期", "遠期", "交叉匯率", "換匯匯率"], [("即期／遠期外匯市場", "第 286、287 題以交割時點作比較。"), ("交叉匯率", "第 288 題以第三種通貨間接計算為線索。"), ("換匯匯率", "第 289 題問遠期與即期匯率的差額。")]),
]
for key, title, pattern, terms, contrasts in family_specs:
    selected = []
    for q in questions:
        short_options = [clean(o) for o in q["options"] if len(clean(o)) <= 35]
        matching = sum(bool(re.search(pattern, o)) for o in short_options)
        if matching >= 2 and re.search(pattern, q["correct"]) and len(q["correct"]) <= 35 or matching >= 3 and q["correct"] in {"以上皆是", "以上皆非"}:
            selected.append(q["id"])
    if key == "risk-management":
        selected = ids([389,390,391,392,393])
    elif key == "insurance-parties":
        selected = ids([398,400]) + ids([95], "職業道德")
    elif key == "exchange":
        selected = ids([286,287,288,289])
    if len(selected) >= 2:
        add("answers-" + key, "answers", title, "選項反覆出現相近名稱；把題幹的對象、定義或條件與各題官方答案對照。否定題選到的名稱，不代表該名稱符合題幹中的敘述。", selected, terms, contrasts)

# Additional high-value answer-name families were inspected against actual options.
# These curated memberships deliberately exclude unrelated questions sharing a topic.
extra_answers = [
    ("finance-channel", "金融名稱：直接、間接、財務與中介", [18,52,58,59,351], "選項反覆出現『直接金融／間接金融／財務金融／金融中介』等相近名稱；比較發行證券與經金融機構融通的線索。", ["直接金融", "間接金融", "財務金融", "金融中介"], [("直接金融", "第 18、59 題以資金需求者發行證券為線索。"), ("間接金融", "第 52、58 題以金融機構取得資金再貸放為線索。")]),
    ("fund-names", "基金名稱：貨幣、保本、成長與價值", [66,117,224,225,226], "這些題的四個選項都是『XX 基金』。題幹換成短期停泊、老年、年輕、積極或保守，應選的基金名稱就可能不同。", ["貨幣市場基金", "保本型基金", "積極成長型基金", "成長型股票基金", "價值型股票基金"], [("短期資金停泊", "第 66 題答案為貨幣市場基金。"), ("老年／年輕", "第 117 題答案為保本型基金；第 224 題答案為積極成長型基金。"), ("積極／保守", "第 225 題為成長型股票基金；第 226 題為價值型股票基金。")]),
    ("receipts-acronyms", "縮寫很像：ADR、TDR、GDR 與 ECB", [67,113,116], "選項反覆使用存託憑證的三字母縮寫，或混入其他海外籌資工具；先讀企業來自哪裡、到哪裡募資。", ["ADR", "TDR", "GDR", "ECB"], [("TDR", "第 67 題：外國企業來臺灣以存託憑證募資。"), ("ADR", "第 113 題：臺灣企業赴美國以存託憑證募資。"), ("第 116 題", "題幹問『不是』國內上市公司海外募資方式，官方答案為 TDR。")]),
    ("underwriting-names", "承銷方式：競價拍賣、詢價圈購與公開申購", [63,168,171], "三題反覆使用近似的一組承銷名稱，但最常用、市場性、公平性與股權分散各問不同條件。", ["競價拍賣", "詢價圈購", "公開申購", "公開申購配售"], [("競價拍賣", "第 168 題以價格較具市場性為線索。"), ("公開申購／公開申購配售", "第 63 題問散戶最常使用方式；第 171 題問公平性與股權分散。")]),
    ("margin-names", "保證金名稱：原始、維持、變動與結算", [196,197], "選項都是相似的『XX 保證金』，一題問追繳門檻、一題問補足水位，不能只記保證金三個字。", ["原始保證金", "維持保證金", "變動保證金", "結算保證金"], [("維持保證金", "第 196 題問淨值跌破後發出追繳通知的水位。"), ("原始保證金", "第 197 題問不足時需補足到哪個水位。")]),
    ("bond-names", "債券名稱：公債、公司債、歐洲與外國債券", [143,147,158,363], "選項包含多個『XX 債券／XX 公債』，分別檢查實體形式、跨國發行定義、商品歸類或信用風險；各題答案要依題幹辨認。", ["無實體公債", "外國債券", "歐洲債券", "金融債券", "垃圾債券"], None),
    ("benefit-names", "給付名稱：生育、傷病、失業與身心障礙", [437,438,439,440,444,446,487], "多個選項僅差『XX 給付』前面的名稱。先看是哪一種保險，再看題目問包含或不包含；同一給付名稱可能在不同題得到不同判斷。", ["生育給付", "傷病給付", "失業給付", "身心障礙給付", "死亡給付", "財損給付"], [("傷病給付", "第 439、440 題均選傷病給付，但各自問的承保情況不同。"), ("失業給付", "第 438、446 題均用『非』問法，官方答案都為失業給付。"), ("財損給付", "第 487 題問強制汽車責任保險『不包括』的給付。")]),
    ("risk-vocabulary", "風險字樣：因素、事故、純粹與基本風險", [384,385,387,388,395,396], "選項都是相近的風險名詞。先分定義層次（風險、因素、事故）與分類軸（純粹、投機、基本等），勿把名稱互換。", ["風險因素", "風險事故", "純粹風險", "基本風險", "財產風險"], [("風險／風險因素", "第 384 題以損失的不確定性為線索；第 385 題以人的健康狀況為例。"), ("基本風險", "第 388 題看影響整個群體或大部分人的情況。"), ("純粹風險", "第 395 題問保險一般承保的風險。")]),
    ("fire-values", "價值名稱：實際價值、重置成本與會計價值", [469,491], "兩題選項都有實際價值與重置成本，也混入會計或原始取得成本等相近字樣；商業火險與住宅火險的題庫答案不同。", ["實際價值", "重置成本", "原始價格", "會計價值", "會計成本", "原始取得成本"], [("實際價值", "第 469 題問商業火災保險金額的基礎。"), ("重置成本", "第 491 題問住宅火災及地震基本保險建築物的保額基礎。")]),
    ("settlement-systems", "清算系統名稱：央行同資、財金網路與轉帳", [353,371], "兩題都出現相近的清算、網路與轉帳系統名稱；先讀是票券交割款項還是拆款市場。", ["央行同資系統", "財金資訊網路", "財金網路系統", "ATM"], [("央行同資系統", "第 353 題問票券款項清算；第 371 題問拆款交割清算，兩題官方答案相同。")]),
    ("policy-names", "政策名稱：公開市場、重貼現率與準備率", [375,376], "兩題共用公開市場操作、重貼現率政策、存款準備率政策等名稱；一題找不屬於貨幣政策者，一題找較具機動性的工具。", ["公開市場操作", "重貼現率政策", "存款準備率政策", "調整稅率政策", "財政政策"], [("第 375 題", "採否定問法，答案為調整稅率政策。"), ("第 376 題", "問較具時效性、機動性及主動性的工具，答案為公開市場操作。")]),
    ("short-term-instrument-names", "票券與存單名稱：國庫券、本票、匯票與定存單", [37,48,203,340,343,344,350,356,359,362,363], "選項反覆使用國庫券、商業本票、銀行承兌匯票、可轉讓定存單等相近工具名稱；部分題混入公司債或股票並採否定問法，不能把被選出的異類也當成短期票券。", ["國庫券", "商業本票", "銀行承兌匯票", "可轉讓定存單", "可轉讓定期存單", "公司債", "股票"], [("國庫券", "第 343 題以中央政府為調節國庫收支、發行未滿一年工具為線索。"), ("可轉讓定期存單", "第 344 題以銀行發行、可轉讓而不可中途解約的短期信用工具為線索。"), ("先看否定問法", "第 37、340、362 題分別選公司股票、公司債、股票作為不符合題幹的工具。")]),
    ("social-authority-names", "機關名稱：公教、勞工、就業與軍人保險", [436,441,443,451], "四題的選項都是機關或機構名稱，容易把相近的部會、局與行政機關配錯；先看題幹是哪一種社會保險。", ["考試院銓敘部", "勞動部", "國防部", "金融監督管理委員會", "保險局", "勞工保險局"], [("考試院銓敘部", "第 436 題：公教人員保險。"), ("勞動部", "第 441、443 題：勞工保險與就業保險。"), ("國防部", "第 451 題：軍人保險。")]),
]
for key, title, numbers, description, terms, contrasts in extra_answers:
    add("answers-" + key, "answers", title, description, ids(numbers), terms, contrasts)

extra_ethics_answers = [
    ("suspension-periods", "停止招攬：3 個月、6 個月、10 個月與 1 年", [4,5,183], "選項反覆出現相同處分搭配不同期限；記住違規行為與期限的配對。", ["停止招攬", "3 個月", "6 個月", "10 個月", "1 年"], [("停止招攬 1 年", "第 4 題以散播不實言論或文宣、擾亂金融秩序或同業信譽為情境。"), ("停止招攬 6 個月", "第 5 題以將本人登錄證提供他人招攬、掛名等使用為情境。"), ("停止招攬 3 個月", "第 183 題以拒絕、勸退身心障礙人士投保為情境。")]),
    ("protection-law-names", "法規名稱：金融消費者、消費者與個資保護", [572,597], "選項反覆出現『XX 保護法』並混入其他法律；第 572 題找處理金融消費爭議的法，第 597 題採排除問法。", ["金融消費者保護法", "消費者保護法", "個人資料保護法", "證券投資人及期貨交易人保護法"], [("第 572 題", "官方答案為金融消費者保護法。"), ("第 597 題", "問不屬於保護證券投資人的專業法律，官方答案為組織犯罪防制條例。")]),
    ("bribery-offense-names", "罪名只差『不』：違背與不違背職務行賄", [603,610], "兩題選項同時出現『違背職務行賄罪』與『不違背職務行賄罪』，閱讀行為條件後再配對罪名。", ["違背職務行賄罪", "不違背職務行賄罪", "圖利罪"], [("第 603、610 題", "兩題官方答案都是不違背職務行賄罪；注意不能漏看罪名中的『不』。")]),
    ("profit-sharing-permission", "句子很像：『可／不得』分享利益、承擔損失", [397,398,399,490,550,556], "多題選項重複『與客戶約定分享利益或共同承擔損失』，但前面可能是可、得或不得；再加上題幹的正反問法，很容易選反。", ["可與客戶", "得與客戶", "不得與客戶", "分享利益", "承擔損失"], [("先看選項的可／不得", "第 397 題的『不得與客戶約定分享利益或共同承擔損失』與第 399、550、556 題的『可與客戶…』意思相反。"), ("再看題幹的有誤／正確", "第 399、490、550、556 題用排除或錯誤問法；不要把被選中的錯誤敘述記成可行行為。")]),
    ("privacy-permission", "句子很像：『得／不得』透露、出售或使用客戶資料", [320,464,467,468,469], "選項反覆出現對外發表、洩漏、出售或提供使用，常只差一個『不』字；先辨認選項語氣，再看題目要選正確或錯誤。", ["得", "不得", "洩漏", "出售", "提供", "客戶資料"], [("第 320 題", "問『為非』，官方答案是得對無權過問同仁洩漏。"), ("第 468、469 題", "問正確敘述，分別選不得任意對外發表、不得出售或提供他人使用。")]),
]
for key, title, numbers, description, terms, contrasts in extra_ethics_answers:
    add("answers-" + key, "answers", title, description, ids(numbers, "職業道德"), terms, contrasts)

# Hand-curated pairs capture semantic resemblance that strict text matching misses.
curated_questions = [
    ("trader-roles", "同樣是證券商：自營、承銷與經紀", [21,22,23,24], "看自行買賣、發行募集與受託交易的角色差別。", ["自營商", "承銷商", "經紀商"]),
    ("trading-venues", "集中撮合或交易商報價？", [25,50,51], "同問交易市場的組織方式，注意集中場所撮合與不同地點交易商報價。", ["集中市場", "店頭市場", "交易商", "撮合"]),
    ("money-instruments", "貨幣市場工具：『不是』與『非屬』", [32,37,48,340,362], "同樣檢查資本／貨幣市場中的商品歸類，均採排除或否定問法。", ["貨幣市場", "信用工具", "公司債", "股票", "商業本票"]),
    ("depositary-receipts", "企業在哪裡募資？TDR 與 ADR", [67,113,116], "注意外國企業來臺與臺灣企業赴美；第 116 題改用否定問法。", ["TDR", "ADR", "臺灣", "美國"]),
    ("rate-units", "利率一碼與一個基本點", [110,111,364], "都問利率單位；一碼與一個基本點是兩個不同數值。", ["基本點", "一碼", "0.01%", "0.25%"]),
    ("periodic-disclosure", "只差『不』：定期與不定期公開資訊", [114,115], "題幹幾乎一樣，分別問定期與不定期資訊中最具即時及攸關性的項目。", ["定期", "不定期", "營業額公告", "重大資訊"]),
    ("zero-coupon", "零息債券：價格與到期贖回", [141,160], "同一商品從票面價格與到期贖回兩種角度出題。", ["零息債券", "票面", "面額"]),
    ("bond-rate", "債券價格與利率敏感性", [151,152,161,163], "同問利率變動對債券價格的影響，注意期限與票面利率的條件。", ["利率", "到期", "票面利率", "價格"]),
    ("foreign-euro-bonds", "外國債券與歐洲債券", [147,156], "同樣是跨國發債，先核對發行地、計價貨幣與發行條件。", ["外國債券", "歐洲債券", "貨幣"]),
    ("underwriting-ways", "申購與承銷方式：公平性或市場性？", [63,168,171], "同問承銷／申購方式，但市場性與公平、股權分散是不同線索。", ["公開申購", "競價拍賣", "公平性", "市場性"]),
    ("margins", "保證金不足：維持水位與補足水位", [196,197], "第 196 題問何時發出追繳，第 197 題問應補到哪個水位。", ["維持保證金", "原始保證金", "追繳", "補足"]),
    ("fund-style", "積極或消極？主動與被動投資管理", [120,220,221,246,247], "看主動挑選、調整配置或投資指數型基金；不是只記基金這個名稱。", ["主動", "積極", "消極", "指數型基金"]),
    ("fund-investor", "積極或保守？投資人與基金配對", [117,118,224,225,226,227], "題幹只換年齡、風險偏好或資產類型，就可能改變答案。", ["老年", "年輕", "積極", "保守"]),
    ("fund-open-closed", "開放型與封閉型：交易、淨值與單位數", [219,248,249,252,253,255], "同一對基金類型重複出題，逐題比較折價、交易方式、單位數與贖回。", ["開放型", "封閉型", "淨值", "贖回"]),
    ("fund-guarantee", "專業管理能否保證獲利？", [231,254], "同樣問共同基金或基金經理人，分清專業管理與保證獲利的敘述。", ["基金經理人", "保證獲利"]),
    ("central-bank", "央行職掌：『非屬』與『錯誤』", [259,260,261,375,376,377,378], "同問中央銀行與貨幣政策；留意正反問法以及寬鬆政策條件。", ["中央銀行", "貨幣政策", "公開市場操作"]),
    ("liquidity-definition", "流動性風險的兩種描述", [102,264], "變現能力、準備部位不足與資金需求，是兩題共同的線索。", ["變現能力", "流動性", "資金需求"]),
    ("secured-lending", "哪些擔保不算擔保授信？", [87,274], "兩題都用否定問法，檢查貸款擔保是否符合法定類型。", ["擔保授信", "保證函", "票據"]),
    ("spot-forward", "即期或遠期外匯：交割日才是關鍵", [286,287], "同樣先決定匯率，差別在交易後第二個營業日或約定未來某日交割。", ["即期", "遠期", "第二個營業日", "未來"]),
    ("trust-definition", "信託定義：移轉財產與為他人利益管理", [308,309,317,318], "幾種問法共同考信託中的財產名義與管理關係；第 318 題另比較委任。", ["委託人", "受託人", "財產", "名義"]),
    ("trust-assets", "只換信託標的：船舶、土地、股票與租賃權", [310,311,312,313,319], "題幹句型相近，但標的是不同財產權，答案名稱隨之改變。", ["船舶", "土地", "股票", "租賃權", "金錢債權"]),
    ("trust-permitted", "信託業可經營業務：兩種否定問法", [324,326], "同樣問不屬於信託業得經營的信託業務。", ["信託業", "不屬於", "非屬"]),
    ("trust-contract", "營業信託與民事信託：契約形式", [327,328], "都問契約形式，先分清營業信託與民事信託。", ["營業信託", "民事信託", "書面", "口頭"]),
    ("bills-payer", "匯票與本票：由誰付款？", [345,348], "大部分文字相同；第 345 題委託付款人支付，第 348 題由發票人自己支付。", ["委託付款人", "自己", "匯票", "本票"]),
    ("bills-acceptance", "銀行與商業承兌匯票：付款人差一個條件", [346,347], "同是商品／勞務交易開出的匯票，注意付款人是銀行還是非銀行相對人。", ["銀行", "非銀行", "承兌匯票"]),
    ("bill-tax", "票券利息：扣繳比例與實拿金額", [272,357,358], "同問票券利息所得扣繳，第 358 題把比例改成實拿金額的計算。", ["利息所得", "扣繳", "10%", "十萬元", "九萬元"]),
    ("cd-maturity", "可轉讓定存單：最短與最長天期", [368,369], "商品相同，題幹分別問最低與最長天期。", ["最低", "最長", "一個月", "一年"]),
    ("risk-frequency", "損失頻率與幅度：選哪種風險管理方法？", [389,390,391,392,393,394], "同問風險管理方法，但完全避免、降低頻率、減輕損失與自行承擔不同。", ["頻率", "幅度", "風險避免", "風險自留", "預防", "抑制"]),
    ("insurance-parties", "當事人與關係人：保險角色配對", [398,400], "只差角色分類，當事人與關係人的組合不同。", ["當事人", "關係人", "要保人", "保險人", "被保險人", "受益人"]),
    ("fixed-benefit", "人壽保險為何屬定額保險？", [402,408], "兩種描述都在辨認按約定一定金額給付的人壽保險。", ["人壽保險", "一定金額", "定額保險"]),
    ("term-insurance", "遞增還是遞減？家庭需求與定期保險", [411,412,413], "同樣問定期保險，核對房屋貸款與養育子女的保障需求。", ["定期保險", "遞增", "遞減", "房屋", "子女"]),
    ("social-insurance-benefits", "社會保險給付：問包含或不包含", [437,438,439,440,444,446,450], "給付名稱很相近，先辨認公教、勞工、就業、農民或軍人保險，再看正反問法。", ["給付", "勞工保險", "就業保險", "農民", "軍人"]),
    ("social-insurance-authorities", "社會保險主管機關：先看保險類型", [436,441,443,451], "題型相同但保險種類不同，主管機關可能相同也可能不同。", ["主管機關", "公教", "勞工", "就業", "軍人"]),
    ("fire-building-value", "住宅與商業火險：保額的計價基礎", [469,491], "同問火災保險建築物的保險金額基礎；先分商業與住宅。", ["商業", "住宅", "實際價值", "重置成本"]),
    ("fire-coinsurance", "共保比例：商業與住宅不同", [471,492], "同問火險共保百分比，但商業與住宅的題庫答案不同。", ["商業", "住宅", "80%", "60%"]),
    ("fire-covered", "商業與住宅火險：哪些事故或標的不承保？", [468,470,490,493], "都用排除問法，先分事故與標的，再看商業或住宅保險。", ["商業", "住宅", "事故", "標的", "不包括", "不承保"]),
    ("vulnerable-consumers", "弱勢金融消費者：相同問法加一個『不』", [496,497,502], "同問弱勢／普惠金融照顧對象，但第 497、502 題問不屬於的對象。", ["弱勢", "不是", "普惠金融", "照顧對象"]),
]
for key, title, numbers, description, terms in curated_questions:
    add("questions-" + key, "questions", title, description, ids(numbers), terms)

ethics_pairs = [
    ("insurance-changes", "投保後條件改變：職業與住宅用途", [98,100], "同樣要求辦理變更批改，注意一題換工作，一題住宅改兼營生意。", ["工作變更", "使用性質變更", "批改"]),
    ("public-marketing", "向不特定多數人銷售：正問與反問", [35,36,37], "先看對象是否為不特定多數人，再看商品是否可公開募集銷售。", ["不特定多數人", "已簽約客戶", "公開募集"]),
    ("customer-needs", "行銷商品時先考慮誰的需求？", [52,55,58,225], "多種問法都比較客戶需求與業績或自身利益。", ["客戶", "需求", "合適"]),
    ("information-principle", "充足資訊與風險告知：資訊公開原則", [217,218,222], "同觀念換句話說：提供充足資訊、投資風險與交易過程資訊。", ["資訊公開原則", "風險", "資訊"]),
    ("confidential-principle", "妥善保管客戶資料：保密原則", [447,459,462], "題幹長短不同，核心都在客戶資產、資料與隱私的保管。", ["保密原則", "客戶資料", "隱私"]),
    ("utmost-good-faith", "保險告知、通知與據實說明", [149,261,262], "同答案最大誠信原則，從合適商品與保險據實說明等角度辨認。", ["最大誠信原則", "告知", "通知", "據實說明"]),
    ("unauthorized-card", "信用卡行銷：不能代客擅自勾選", [62,65,72,554], "相似違規行為換成發卡行銷或開戶情境，留意客戶有沒有同意。", ["自行勾選", "客戶同意", "信用卡"]),
    ("private-data", "客戶資料處理：正確與錯誤問法", [320,469], "題幹高度相近，但一題問『為非』、另一題問『正確』。", ["客戶資料", "為非", "正確"]),
    ("undisclosed-news", "尚未公開重大消息：如何處理？", [518,536], "兩題均問因職務知悉尚未公開重大消息時應如何處理。", ["尚未公開", "重大消息", "職務"]),
]
for key, title, numbers, description, terms in ethics_pairs:
    add("questions-" + key, "questions", title, description, ids(numbers, "職業道德"), terms)

# Strict character-bigram TF-IDF comparison. Remove question boilerplate first;
# require substantial content and an average-to-seed score, avoiding chain linkage.
noise = ["下列", "以下", "何者", "敘述", "有關", "正確", "錯誤", "不正確", "最正確", "何種", "哪一種", "那一種", "之規定", "規定", "係指", "稱為", "是指", "所稱", "依照", "依據", "應如何", "請問", "選項", "我國", "目前", "國內", "不是", "不屬於", "不屬", "非屬", "何謂", "是屬於", "屬於", "為何", "可以", "不得", "應該", "其他條件不變下", "其他因素不變下", "其他條件相同下", "下述", "相關", "說明", "為非", "有誤", "如何", "哪個", "哪一個", "何人", "那個", "不可", "非為", "下何者", "最主要"]
def normalized_prompt(prompt):
    value = clean(prompt)
    for term in sorted(noise, key=len, reverse=True):
        value = value.replace(term, "")
    return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", value).lower()
norms = [normalized_prompt(q["prompt"]) for q in questions]
tokens = [set(value[i:i+2] for i in range(len(value)-1)) for value in norms]
frequencies = collections.Counter(g for token_set in tokens for g in token_set)
vectors = [{g: math.log((len(questions)+1)/(frequencies[g]+1)) for g in token_set} for token_set in tokens]
magnitudes = [math.sqrt(sum(v*v for v in vector.values())) for vector in vectors]
pair_scores = {}
for i, vector in enumerate(vectors):
    if len(norms[i]) < 12:
        continue
    for j in range(i+1, len(questions)):
        if len(norms[j]) < 12:
            continue
        common = tokens[i] & tokens[j]
        if len(common) < 8:
            continue
        score = sum(vector[g] * vectors[j][g] for g in common)/(magnitudes[i] * magnitudes[j])
        if score >= .76:
            pair_scores[(i, j)] = score

def score(a, b):
    return 1 if a == b else pair_scores.get(tuple(sorted((a,b))), 0)

existing_question_sets = [set(g["questionIds"]) for g in groups if g["kind"] == "questions"]
auto_sets = []
for (i,j), pair_score in sorted(pair_scores.items(), key=lambda item: (-item[1], item[0])):
    if any({i,j} <= group_set for group_set in auto_sets):
        continue
    members = {i,j}
    candidates = sorted({k for a,b in pair_scores for k in (a,b) if i in (a,b) or j in (a,b)})
    for k in candidates:
        if k not in members and min(score(k,m) for m in members) >= .70 and max(score(k,m) for m in members) >= .82:
            members.add(k)
    question_ids = [questions[k]["id"] for k in sorted(members)]
    if any(set(question_ids) <= existing for existing in existing_question_sets):
        continue
    auto_sets.append(members)
    representative = clean(questions[min(members)]["prompt"])
    # Retain concrete shared content, not generic '執行業務時' buckets.
    if not re.search(r"廣告|招攬|促銷|全權委託|受託管理|簽約|有價證券|衍生性|自律公約|投資型|財富管理|利益衝突|催收|帳戶|洗錢|資恐|保險|客戶資料", representative):
        continue
    title = representative
    for prefix in ["下列關於", "有關", "關於"]:
        if title.startswith(prefix):
            title = title[len(prefix):]
    title = re.split(r"[，,：:？?]", title)[0]
    if "自律公約" in representative:
        title = "證券商會員自律公約的基本要求"
    elif "洗錢" in representative and "帳戶" in representative:
        title = "疑似洗錢、資恐的帳戶類與交易類態樣"
    if len(title) > 30:
        title = title[:30] + "…"
    group_id = "questions-sim-" + hashlib.sha1("|".join(question_ids).encode()).hexdigest()[:10]
    add(group_id, "questions", "近似問法：" + title, "題幹去除常見問句後，以字詞重合與稀有字詞加權比對；同群題幹高度相近。請對照否定詞、適用對象與每題選項，不能直接沿用其他題答案。", question_ids)

# Remove an automatically generated strict subset when a larger strict cluster
# already compares all its members. Curated groups retain their deliberate focus.
auto_groups = [g for g in groups if g["id"].startswith("questions-sim-")]
redundant_auto = {g["id"] for g in auto_groups if any(set(g["questionIds"]) < set(other["questionIds"]) for other in auto_groups)}
groups = [g for g in groups if g["id"] not in redundant_auto]

# Reviewed near-identical stems can form several overlapping pair clusters.
# Merge only these three manually verified cores to keep one tracking record.
merge_specs = [
    ("advertising", "近似問法：廣告、業務招攬及營業促銷活動", [24,25,26,27,29,578,580]),
    ("investment-sales", "近似問法：投資型金融商品推介與銷售", [152,159,161,399,549,558]),
    ("discretionary", "近似問法：全權委託業務的應遵守事項", [154,168,171,324,395,397,398]),
]
for key, title, numbers in merge_specs:
    members = ids(numbers, "職業道德")
    groups = [g for g in groups if not (g["id"].startswith("questions-sim-") and set(g["questionIds"]) <= set(members))]
    add("questions-stems-" + key, "questions", title, "已逐題核對的相近題幹群：核心情境相同，問法可能換成正確、有誤、為非或不得。選項與官方答案可能不同，請逐題對照。", members)

# Meaningful identical correct answers help track different prompts leading to one term.
answer_members = collections.defaultdict(list)
for q in questions:
    answer_members[q["correct"]].append(q["id"])
for answer, members in answer_members.items():
    if len(members) < 2 or not 3 <= len(answer) <= 32:
        continue
    if re.search(r"以上|皆|選項|只有|都正確|較正確|為真|敘述|[ABCDabcdⅠⅡⅢⅣ]|正確$|不可以", answer):
        continue
    if not re.search(r"[\u4e00-\u9fff]", answer) or len(set(answer)) < 3:
        continue
    add("answers-same-" + hashlib.sha1(answer.encode()).hexdigest()[:10], "answers", "同答案：「" + answer + "」", "這些題的官方正確答案文字相同；題目情境與正反問法可能不同，請比較各題為什麼選到這個答案。", members, [answer])

assert len({g["id"] for g in groups}) == len(groups)
counts = collections.Counter(g["kind"] for g in groups)
covered = {qid for g in groups for qid in g["questionIds"]}
payload = {"version": 1, "source": "本機 113 年 9 月 1 日起適用題庫；原始題目與答案不變", "method": "精選觀念對照＋嚴格題幹文字相似比對＋具體同答案分組；非官方分類", "groups": groups}
target = ROOT / "assets" / "similarity-data.js"
target.write_text("/* Generated by build_similarity_catalog.py. Official question text and keys remain in index.html. */\nwindow.SFI_SIMILARITY = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
print(json.dumps({"file": str(target), "counts": dict(counts), "coveredQuestions": len(covered), "totalGroups": len(groups)}, ensure_ascii=False))
for g in groups:
    print(g["kind"], len(g["questionIds"]), g["title"], ",".join(g["questionIds"]))
