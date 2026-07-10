# sample.py — for exercising the Python debug engine
def add(a, b):
    total = a + b
    return total


def main():
    numbers = [1, 2, 3]
    acc = 0
    for n in numbers:
        acc = add(acc, n)
        print("acc =", acc)
    print("done:", acc)


main()
